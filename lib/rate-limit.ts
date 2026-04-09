import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { safeLogServerEvent } from '@/lib/app-event-log'

interface ActionRateLimitOptions {
  authClient?: Pick<SupabaseClient, 'rpc'>
  action: string
  actorUserId: string
  actorRole?: string | null
  actorName?: string | null
  businessId?: string | null
  moduleKey?: string | null
  route?: string | null
  targetId?: string | null
  limit: number
  windowMs: number
  errorMessage: string
}

interface UpstashCommandResult {
  result?: string | number | null
  error?: string
}

function createRateLimitResponse(errorMessage: string, retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: errorMessage,
      retry_after_seconds: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    },
  )
}

function createRateLimitKey(options: ActionRateLimitOptions) {
  return ['rate_limit', options.action, options.actorUserId].join(':')
}

function getConfiguredRetryAfterSeconds(windowMs: number, ttlMs?: number) {
  if (typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0) {
    return Math.max(1, Math.ceil(ttlMs / 1000))
  }

  return Math.max(1, Math.ceil(windowMs / 1000))
}

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return null
  }

  return {
    url,
    token,
  }
}

async function enforceUpstashRateLimit(options: ActionRateLimitOptions) {
  const config = getUpstashConfig()
  if (!config) {
    return null
  }

  const rateLimitKey = createRateLimitKey(options)
  const transaction = [
    ['SET', rateLimitKey, '0', 'PX', String(options.windowMs), 'NX'],
    ['INCR', rateLimitKey],
    ['PTTL', rateLimitKey],
  ]

  const response = await fetch(`${config.url}/multi-exec`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(transaction),
    cache: 'no-store',
  })

  const payload = (await response.json()) as UpstashCommandResult[] | { error?: string }
  if (!response.ok) {
    const errorMessage =
      !Array.isArray(payload) && payload?.error
        ? payload.error
        : `HTTP ${response.status}`
    throw new Error(`Upstash rate-limit transaction failed: ${errorMessage}`)
  }

  if (!Array.isArray(payload)) {
    throw new Error(`Upstash rate-limit transaction returned a non-array payload`)
  }

  const commandError = payload.find((entry) => entry?.error)
  if (commandError?.error) {
    throw new Error(`Upstash rate-limit command failed: ${commandError.error}`)
  }

  const count = Number(payload[1]?.result ?? 0)
  const ttlMs = Number(payload[2]?.result ?? options.windowMs)
  const retryAfterSeconds = getConfiguredRetryAfterSeconds(options.windowMs, ttlMs)

  if (count < options.limit) {
    return null
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: options.action,
    result: 'failure',
    actorUserId: options.actorUserId,
    actorRole: options.actorRole ?? null,
    actorName: options.actorName ?? null,
    businessId: options.businessId ?? null,
    moduleKey: options.moduleKey ?? null,
    route: options.route ?? null,
    targetId: options.targetId ?? null,
    errorMessage: 'Rate limit exceeded',
    context: {
      rate_limit_backend: 'upstash_redis',
      rate_limit_limit: options.limit,
      rate_limit_window_seconds: Math.ceil(options.windowMs / 1000),
      rate_limit_count: count,
      rate_limit_retry_after_seconds: retryAfterSeconds,
    },
  })

  return createRateLimitResponse(options.errorMessage, retryAfterSeconds)
}

async function enforceDatabaseRateLimit(options: ActionRateLimitOptions) {
  if (!options.authClient) {
    console.error('[rate-limit] missing authenticated Supabase client for fallback rate limit')
    return null
  }

  const windowStart = new Date(Date.now() - options.windowMs).toISOString()
  const retryAfterSeconds = getConfiguredRetryAfterSeconds(options.windowMs)

  const { data, error } = await options.authClient.rpc('count_my_recent_app_events', {
    p_action: options.action,
    p_window_start: windowStart,
  })

  if (error) {
    console.error('[rate-limit] authenticated fallback count error:', error)
    return null
  }

  const count = Number(data ?? 0)

  if (count < options.limit) {
    return null
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: options.action,
    result: 'failure',
    actorUserId: options.actorUserId,
    actorRole: options.actorRole ?? null,
    actorName: options.actorName ?? null,
    businessId: options.businessId ?? null,
    moduleKey: options.moduleKey ?? null,
    route: options.route ?? null,
    targetId: options.targetId ?? null,
    errorMessage: 'Rate limit exceeded',
    context: {
      rate_limit_backend: 'supabase_event_log_fallback',
      rate_limit_limit: options.limit,
      rate_limit_window_seconds: Math.ceil(options.windowMs / 1000),
      rate_limit_count: count,
    },
  })

  return createRateLimitResponse(options.errorMessage, retryAfterSeconds)
}

export async function enforceActionRateLimit(options: ActionRateLimitOptions) {
  try {
    const upstashResponse = await enforceUpstashRateLimit(options)
    if (upstashResponse) {
      return upstashResponse
    }

    return await enforceDatabaseRateLimit(options)
  } catch (error) {
    console.error('[rate-limit] unexpected error:', error)
    return enforceDatabaseRateLimit(options)
  }
}
