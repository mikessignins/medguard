import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { safeLogServerEvent } from '@/lib/app-event-log'

interface ActionRateLimitOptions {
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

export async function enforceActionRateLimit(options: ActionRateLimitOptions) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceRoleKey) {
      console.error('[rate-limit] missing Supabase service role configuration')
      return null
    }

    const service = createServiceClient(url, serviceRoleKey)
    const windowStart = new Date(Date.now() - options.windowMs).toISOString()
    const retryAfterSeconds = Math.max(1, Math.ceil(options.windowMs / 1000))

    const { count, error } = await service
      .from('app_event_log')
      .select('id', { count: 'exact', head: true })
      .eq('actor_user_id', options.actorUserId)
      .eq('action', options.action)
      .gte('created_at', windowStart)

    if (error) {
      console.error('[rate-limit] count error:', error)
      return null
    }

    if ((count ?? 0) < options.limit) {
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
        rate_limit_limit: options.limit,
        rate_limit_window_seconds: Math.ceil(options.windowMs / 1000),
      },
    })

    return createRateLimitResponse(options.errorMessage, retryAfterSeconds)
  } catch (error) {
    console.error('[rate-limit] unexpected error:', error)
    return null
  }
}
