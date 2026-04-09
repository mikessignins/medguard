import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAuthenticatedUser, requireMedicScope, requireRole } from '@/lib/route-access'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { psychosocialPurgeRequestSchema } from '@/lib/review-request-schemas'
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
    },
  )

  const { data: { user } } = await authClient.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return new NextResponse(authError.error, { status: authError.status })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id, site_ids')
    .eq('id', userId)
    .single()
  const roleError = requireRole(account, 'medic')
  if (roleError) return new NextResponse(roleError.error, { status: roleError.status })
  const medicAccount = account!

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'psychosocial_purge_completed',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/purge',
    limit: 5,
    windowMs: 15 * 60_000,
    errorMessage: 'Too many psychosocial purge requests were submitted. Please wait before trying again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, psychosocialPurgeRequestSchema)
  if (!parsed.success) return parsed.response
  const { ids } = parsed.data

  if (ids.length === 0) return NextResponse.json({ purged: 0 })

  const { data: assessments } = await authClient
    .from('module_submissions')
    .select('id, business_id, site_id, payload, review_payload, exported_at, exported_by_name, reviewed_at, module_key')
    .eq('module_key', 'psychosocial_health')
    .in('id', ids)

  if ((assessments ?? []).length !== ids.length) {
    return NextResponse.json({ error: 'One or more psychosocial support check-ins were not found.' }, { status: 404 })
  }

  const invalidWorkflow = (assessments ?? []).some((entry) => {
    const workflowKind = entry.payload?.workerPulse?.workflowKind
      ?? (entry.payload?.postIncidentWelfare ? 'post_incident_psychological_welfare' : null)
    return !['support_check_in', 'post_incident_psychological_welfare'].includes(workflowKind ?? '')
  })
  if (invalidWorkflow) {
    return NextResponse.json({ error: 'Only reviewed psychosocial support and post-incident welfare cases can be purged through this workflow.' }, { status: 400 })
  }

  const outOfScope = (assessments ?? []).some((entry) => requireMedicScope(medicAccount, entry))
  if (outOfScope) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const unexported = (assessments ?? []).filter((entry) => !entry.exported_at)
  if (unexported.length > 0) {
    return NextResponse.json(
      { error: 'All psychosocial support check-ins must be exported to PDF before purging.' },
      { status: 400 },
    )
  }

  const purgedAt = new Date().toISOString()
  const auditRows = (assessments ?? []).map((entry) => {
    const payload =
      typeof entry.payload === 'object' && entry.payload
        ? (entry.payload as Record<string, unknown>)
        : null
    const workerPulse =
      payload?.workerPulse && typeof payload.workerPulse === 'object'
        ? (payload.workerPulse as Record<string, unknown>)
        : null
    const reviewPayload =
      typeof entry.review_payload === 'object' && entry.review_payload
        ? (entry.review_payload as Record<string, unknown>)
        : null

    return {
      submission_id: entry.id,
      worker_name: (workerPulse?.workerNameSnapshot as string) ?? null,
      worker_dob: null,
      site_id: entry.site_id ?? null,
      site_name: null,
      business_id: entry.business_id,
      medic_user_id: userId,
      medic_name: medicAccount.display_name as string,
      purged_at: purgedAt,
      form_type: entry.payload?.postIncidentWelfare ? 'psychosocial_post_incident_welfare' : 'psychosocial_support_checkin',
      exported_at: entry.exported_at ?? null,
      exported_by_name: entry.exported_by_name ?? null,
      approved_by_name: (reviewPayload?.reviewedByName as string) ?? null,
      approved_at: entry.reviewed_at ?? null,
    }
  })

  if (auditRows.length > 0) {
    const { error: auditError } = await authClient.from('purge_audit_log').insert(auditRows)
    if (auditError) console.error('[psychosocial/purge] audit log error:', auditError)
  }

  const { error } = await authClient
    .from('module_submissions')
    .update({
      phi_purged_at: purgedAt,
      payload: {},
      review_payload: {},
    })
    .eq('module_key', 'psychosocial_health')
    .in('id', ids)

  if (error) {
    console.error('[psychosocial/purge] update error:', error)
    await safeLogServerEvent({
      source: 'web_api',
      action: 'psychosocial_purge_completed',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'psychosocial_health',
      route: '/api/psychosocial-assessments/purge',
      errorMessage: error.message,
      context: { purge_count: ids.length },
    })
    return new NextResponse(`Purge failed: ${error.message}`, { status: 500 })
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'psychosocial_purge_completed',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/purge',
    context: { purge_count: ids.length },
  })

  return NextResponse.json({ purged: ids.length })
}
