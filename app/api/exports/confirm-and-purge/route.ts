import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { parseJsonBody } from '@/lib/api-validation'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { requireActiveMedic, requireAuthenticatedUser } from '@/lib/route-access'
import { exportConfirmationRequestSchema } from '@/lib/review-request-schemas'

export const runtime = 'nodejs'

const MODULE_KEYS = {
  emergency_declaration: 'emergency_declaration',
  medication_declaration: 'confidential_medication',
  fatigue_assessment: 'fatigue_assessment',
  psychosocial_health: 'psychosocial_health',
} as const

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
    },
  )

  const { data: { user } } = await authClient.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return new NextResponse(authError.error, { status: authError.status })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id, site_ids, is_inactive, contract_end_date')
    .eq('id', userId)
    .single()
  const roleError = requireActiveMedic(account)
  if (roleError) return new NextResponse(roleError.error, { status: roleError.status })
  const medicAccount = account!

  const parsed = await parseJsonBody(request, exportConfirmationRequestSchema)
  if (!parsed.success) return parsed.response
  const { formType, id } = parsed.data

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'export_confirmed_phi_purged',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: MODULE_KEYS[formType],
    route: '/api/exports/confirm-and-purge',
    limit: 8,
    windowMs: 15 * 60_000,
    errorMessage: 'Too many export confirmations were submitted. Please wait before trying again.',
  })
  if (rateLimited) return rateLimited

  const { data, error } = await authClient.rpc('confirm_export_and_purge_phi', {
    p_form_type: formType,
    p_record_id: id,
  })

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'export_confirmed_phi_purged',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: MODULE_KEYS[formType],
      route: '/api/exports/confirm-and-purge',
      targetId: id,
      errorMessage: error.message,
    })
    return logAndReturnInternalError('/api/exports/confirm-and-purge', error)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'export_confirmed_phi_purged',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: MODULE_KEYS[formType],
    route: '/api/exports/confirm-and-purge',
    targetId: id,
    context: data && typeof data === 'object' ? data as Record<string, unknown> : {},
  })

  return NextResponse.json(data ?? { status: 'purged' })
}
