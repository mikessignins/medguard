import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireActiveMedic, requireAuthenticatedUser, requireMedicScope } from '@/lib/route-access'
import type { PsychosocialModulePayload, PsychosocialPostIncidentEventType } from '@/lib/types'
import { parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { psychosocialPostIncidentRequestSchema } from '@/lib/review-request-schemas'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { enforceActionRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

async function resolveWorkerId({
  authClient,
  businessId,
  siteId,
  workerId,
  workerNameSnapshot,
}: {
  authClient: ReturnType<typeof createServerClient>
  businessId: string
  siteId: string
  workerId: string | null
  workerNameSnapshot: string
}) {
  if (workerId) return { workerId }

  const { data, error } = await authClient.rpc('resolve_scoped_worker_account', {
    p_business_id: businessId,
    p_site_id: siteId,
    p_worker_id: workerId,
    p_worker_name: workerNameSnapshot,
  })
  const workers = (data ?? []) as Array<{ worker_id: string; display_name: string | null }>

  if (error) {
    return { error: 'Unable to validate the worker account for this welfare case.' }
  }

  if (workers.length === 0) {
    return { error: 'No worker account matched that name at this site. Enter the worker name exactly as registered in MedGuard or add the worker account ID as a fallback.' }
  }

  if (workers.length > 1) {
    return { error: 'More than one worker account matched that name at this site. Please enter the worker account ID fallback to identify the correct worker.' }
  }

  return { workerId: workers[0].worker_id }
}

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
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id, site_ids, is_inactive')
    .eq('id', userId)
    .single()

  const roleError = requireActiveMedic(account)
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })
  const medicAccount = account!

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'psychosocial_post_incident_created',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/post-incident',
    limit: 10,
    windowMs: 10 * 60_000,
    errorMessage: 'Too many post-incident welfare cases were created in a short period. Please wait a few minutes and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, psychosocialPostIncidentRequestSchema)
  if (!parsed.success) return parsed.response

  const {
    site_id,
    workerNameSnapshot,
    workerId,
    jobRole,
    linkedIncidentOrCaseId,
    eventType,
    eventDateTime,
    natureOfExposure,
    initialDefusingOffered,
    normalReactionsExplained,
    supportPersonContacted,
    eapReferralOffered,
    externalPsychologyReferralOffered,
    followUpScheduledAt,
    confidentialityAcknowledged,
    reviewNotes,
  } = parsed.data

  const scopeError = requireMedicScope(medicAccount, { business_id: medicAccount.business_id, site_id })
  if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })

  const resolvedWorker = await resolveWorkerId({
    authClient,
    businessId: medicAccount.business_id,
    siteId: site_id,
    workerId: workerId ?? null,
    workerNameSnapshot,
  })

  if (resolvedWorker.error) {
    return NextResponse.json({ error: resolvedWorker.error }, { status: 400 })
  }

  const resolvedWorkerId = resolvedWorker.workerId
  const { data: resolvedWorkerAccount } = await authClient
    .from('user_accounts')
    .select('display_name')
    .eq('id', resolvedWorkerId)
    .maybeSingle()
  const canonicalWorkerName = resolvedWorkerAccount?.display_name?.trim() || workerNameSnapshot.trim()

  const payload: PsychosocialModulePayload = {
    postIncidentWelfare: {
      linkedIncidentOrCaseId,
      workerId: resolvedWorkerId,
      workerNameSnapshot: canonicalWorkerName,
      jobRole,
      eventType: eventType as PsychosocialPostIncidentEventType,
      eventDateTime,
      natureOfExposure,
      initialDefusingOffered,
      normalReactionsExplained,
      supportPersonContacted,
      eapReferralOffered,
      externalPsychologyReferralOffered,
      followUpScheduledAt,
      confidentialityAcknowledged,
      reviewNotes,
    },
    scoreSummary: {
      derivedPulseRiskLevel: 'high',
      domainSignalCounts: { traumatic_events_or_material: 1 },
      requestedSupport: true,
      requiresReview: true,
      requiresUrgentFollowUp: false,
    },
  }

  const review_payload = {
    reviewStartedAt: new Date().toISOString(),
    reviewedByUserId: userId,
    reviewedByName: medicAccount.display_name,
    caseOwnerUserId: userId,
    caseOwnerName: medicAccount.display_name,
    triagePriority: 'priority',
    assignedReviewPath: 'medic',
    contactOutcome: 'not_contacted_yet',
    followUpRequired: !!followUpScheduledAt,
    followUpScheduledAt,
    supportPersonContacted,
    eapReferralOffered,
    externalPsychologyReferralOffered,
  }

  const { data, error } = await authClient
    .from('module_submissions')
    .insert({
      business_id: medicAccount.business_id,
      site_id,
      worker_id: resolvedWorkerId,
      module_key: 'psychosocial_health',
      module_version: 1,
      status: 'in_medic_review',
      payload,
      review_payload,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .select('id')
    .single()

  if (error || !data) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'psychosocial_post_incident_created',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'psychosocial_health',
      route: '/api/psychosocial-assessments/post-incident',
      errorMessage: error?.message || 'Failed to create post-incident welfare case.',
      context: { site_id, event_type: eventType },
    })
    return NextResponse.json({ error: error?.message || 'Failed to create post-incident welfare case.' }, { status: 500 })
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'psychosocial_post_incident_created',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/post-incident',
    targetId: data.id,
    context: { site_id, event_type: eventType },
  })

  return NextResponse.json({ id: data.id })
}
