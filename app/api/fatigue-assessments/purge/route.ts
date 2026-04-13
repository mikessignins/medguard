import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireActiveMedic, requireAuthenticatedUser, requireMedicScope } from '@/lib/route-access'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { fatiguePurgeRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { validatePurgeSelection } from '@/lib/purge-guards'

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

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'fatigue_purge_completed',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'fatigue_assessment',
    route: '/api/fatigue-assessments/purge',
    limit: 5,
    windowMs: 15 * 60_000,
    errorMessage: 'Too many fatigue purge requests were submitted. Please wait before trying again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, fatiguePurgeRequestSchema)
  if (!parsed.success) return parsed.response
  const { ids } = parsed.data

  if (ids.length === 0) return NextResponse.json({ purged: 0 })

  const { data: assessments } = await authClient
    .from('module_submissions')
    .select('id, business_id, site_id, payload, review_payload, status, exported_at, export_confirmed_at, export_confirmed_by_name, exported_by_name, reviewed_at, is_test')
    .eq('module_key', 'fatigue_assessment')
    .in('id', ids)

  const purgeError = validatePurgeSelection(ids, assessments ?? [], {
    testFinalStatuses: ['resolved'],
    notFoundError: 'One or more fatigue assessments were not found.',
    blockedError: 'All production fatigue assessments must be exported and confirmed before health information can be purged. Reviewed test assessments can be purged without export.',
  })
  if (purgeError) return NextResponse.json({ error: purgeError.error }, { status: purgeError.status })

  const outOfScope = (assessments ?? []).some((entry) => requireMedicScope(medicAccount, entry))
  if (outOfScope) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const purgedAt = new Date().toISOString()
  const auditRows = (assessments ?? []).map((entry) => {
    const payload =
      typeof entry.payload === 'object' && entry.payload
        ? (entry.payload as Record<string, unknown>)
        : null
    const workerAssessment =
      payload?.workerAssessment && typeof payload.workerAssessment === 'object'
        ? (payload.workerAssessment as Record<string, unknown>)
        : null
    const reviewPayload =
      typeof entry.review_payload === 'object' && entry.review_payload
        ? (entry.review_payload as Record<string, unknown>)
        : null

    return {
      submission_id: entry.id,
      worker_name: (workerAssessment?.workerNameSnapshot as string) ?? null,
      worker_dob: null,
      site_id: entry.site_id ?? null,
      site_name: null,
      business_id: entry.business_id,
      medic_user_id: userId,
      medic_name: medicAccount.display_name as string,
      purged_at: purgedAt,
      form_type: 'fatigue_assessment',
      exported_at: entry.exported_at ?? null,
      exported_by_name: entry.exported_by_name ?? null,
      export_confirmed_at: entry.export_confirmed_at ?? null,
      export_confirmed_by_name: entry.export_confirmed_by_name ?? null,
      approved_by_name: (reviewPayload?.reviewedByName as string) ?? null,
      approved_at: entry.reviewed_at ?? null,
    }
  })

  const { error } = await authClient
    .from('module_submissions')
    .update({
      phi_purged_at: purgedAt,
      payload: {},
    })
    .eq('module_key', 'fatigue_assessment')
    .in('id', ids)

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'fatigue_purge_completed',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'fatigue_assessment',
      route: '/api/fatigue-assessments/purge',
      errorMessage: error.message,
      context: { purge_count: ids.length },
    })
    return logAndReturnInternalError('/api/fatigue-assessments/purge', error)
  }

  if (auditRows.length > 0) {
    const { error: auditError } = await authClient.from('purge_audit_log').insert(auditRows)
    if (auditError) {
      await safeLogServerEvent({
        source: 'web_api',
        action: 'fatigue_purge_completed',
        result: 'failure',
        actorUserId: userId,
        actorRole: medicAccount.role,
        actorName: medicAccount.display_name,
        businessId: medicAccount.business_id,
        moduleKey: 'fatigue_assessment',
        route: '/api/fatigue-assessments/purge',
        errorMessage: auditError.message,
        context: { purge_count: ids.length, purge_completed_but_audit_failed: true },
      })
      return logAndReturnInternalError('/api/fatigue-assessments/purge', auditError)
    }
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'fatigue_purge_completed',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'fatigue_assessment',
    route: '/api/fatigue-assessments/purge',
    context: { purge_count: ids.length },
  })

  return NextResponse.json({ purged: ids.length })
}
