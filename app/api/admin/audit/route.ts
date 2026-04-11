import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { adminAuditRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request)
  if (csrfError) return csrfError

  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'admin_audit_recorded',
    actorUserId: user.id,
    actorRole: account.role,
    actorName: account.display_name,
    businessId: account.business_id,
    route: '/api/admin/audit',
    limit: 20,
    windowMs: 60_000,
    errorMessage: 'Too many admin audit actions were submitted. Please wait a minute and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, adminAuditRequestSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  if (body.target_user_id) {
    const { data: targetAccount, error: targetAccountError } = await authClient
      .from('user_accounts')
      .select('id, business_id')
      .eq('id', body.target_user_id)
      .maybeSingle()

    if (targetAccountError) {
      return new NextResponse('Unable to validate target user', { status: 500 })
    }

    if (!targetAccount || targetAccount.business_id !== account.business_id) {
      return new NextResponse('Target user must belong to the same business', { status: 400 })
    }
  }

  const { error } = await authClient.from('admin_action_log').insert({
    business_id:    account.business_id,
    actor_user_id:  user.id,
    actor_name:     account.display_name as string,
    action:         body.action.trim(),
    target_user_id: body.target_user_id ?? null,
    target_name:    body.target_name ?? null,
    detail:         body.detail ?? null,
  })

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'admin_audit_recorded',
      result: 'failure',
      actorUserId: user.id,
      actorRole: account.role,
      actorName: account.display_name,
      businessId: account.business_id,
      route: '/api/admin/audit',
      errorMessage: error.message,
      context: { action: body.action },
    })
    return logAndReturnInternalError('/api/admin/audit', error)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'admin_audit_recorded',
    result: 'success',
    actorUserId: user.id,
    actorRole: account.role,
    actorName: account.display_name,
    businessId: account.business_id,
    route: '/api/admin/audit',
    context: { action: body.action },
  })

  return new NextResponse(null, { status: 204 })
}
