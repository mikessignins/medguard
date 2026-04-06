import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireAuthenticatedUser, requireMedicScope, requireRole } from '@/lib/route-access'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody } from '@/lib/api-validation'
import { fatiguePurgeRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: assessments } = await supabase
    .from('module_submissions')
    .select('id, business_id, site_id, payload, review_payload, exported_at, exported_by_name, reviewed_at')
    .eq('module_key', 'fatigue_assessment')
    .in('id', ids)

  if ((assessments ?? []).length !== ids.length) {
    return NextResponse.json({ error: 'One or more fatigue assessments were not found.' }, { status: 404 })
  }

  const outOfScope = (assessments ?? []).some((entry) => requireMedicScope(medicAccount, entry))
  if (outOfScope) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const unexported = (assessments ?? []).filter((entry) => !entry.exported_at)
  if (unexported.length > 0) {
    return NextResponse.json(
      { error: 'All fatigue assessments must be exported to PDF before purging.' },
      { status: 400 },
    )
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
      approved_by_name: (reviewPayload?.reviewedByName as string) ?? null,
      approved_at: entry.reviewed_at ?? null,
    }
  })

  if (auditRows.length > 0) {
    const { error: auditError } = await supabase.from('purge_audit_log').insert(auditRows)
    if (auditError) console.error('[fatigue/purge] audit log error:', auditError)
  }

  const { error } = await supabase
    .from('module_submissions')
    .update({
      phi_purged_at: purgedAt,
      payload: {},
      review_payload: {},
    })
    .eq('module_key', 'fatigue_assessment')
    .in('id', ids)

  if (error) {
    console.error('[fatigue/purge] update error:', error)
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
    return new NextResponse(`Purge failed: ${error.message}`, { status: 500 })
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
