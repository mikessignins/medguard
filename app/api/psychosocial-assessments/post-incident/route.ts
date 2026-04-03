import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import type { PsychosocialModulePayload, PsychosocialPostIncidentEventType } from '@/lib/types'

export const runtime = 'nodejs'

const EVENT_TYPES: PsychosocialPostIncidentEventType[] = [
  'witnessed_serious_injury',
  'witnessed_death',
  'involved_in_cpr',
  'personally_injured',
  'serious_near_miss',
  'distressing_behavioural_incident',
  'other',
]

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id, site_ids')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'medic') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const site_id = typeof body.site_id === 'string' ? body.site_id : ''
  const workerNameSnapshot = typeof body.workerNameSnapshot === 'string' ? body.workerNameSnapshot.trim() : ''
  const eventType = typeof body.eventType === 'string' ? body.eventType as PsychosocialPostIncidentEventType : null
  const eventDateTime = typeof body.eventDateTime === 'string' ? body.eventDateTime : ''
  const natureOfExposure = typeof body.natureOfExposure === 'string' ? body.natureOfExposure.trim() : ''

  if (!site_id || !workerNameSnapshot || !eventType || !EVENT_TYPES.includes(eventType) || !eventDateTime || !natureOfExposure) {
    return NextResponse.json({ error: 'Missing required post-incident welfare fields.' }, { status: 400 })
  }

  if (!hasMedicScopeAccess(account, { business_id: account.business_id, site_id })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const payload: PsychosocialModulePayload = {
    postIncidentWelfare: {
      linkedIncidentOrCaseId: typeof body.linkedIncidentOrCaseId === 'string' ? body.linkedIncidentOrCaseId || null : null,
      workerId: typeof body.workerId === 'string' ? body.workerId || null : null,
      workerNameSnapshot,
      jobRole: typeof body.jobRole === 'string' ? body.jobRole || null : null,
      eventType,
      eventDateTime,
      natureOfExposure,
      initialDefusingOffered: Boolean(body.initialDefusingOffered),
      normalReactionsExplained: Boolean(body.normalReactionsExplained),
      supportPersonContacted: Boolean(body.supportPersonContacted),
      eapReferralOffered: Boolean(body.eapReferralOffered),
      externalPsychologyReferralOffered: Boolean(body.externalPsychologyReferralOffered),
      followUpScheduledAt: typeof body.followUpScheduledAt === 'string' && body.followUpScheduledAt ? body.followUpScheduledAt : null,
      confidentialityAcknowledged: Boolean(body.confidentialityAcknowledged),
      reviewNotes: typeof body.reviewNotes === 'string' ? body.reviewNotes || null : null,
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
    reviewedByUserId: user.id,
    reviewedByName: account.display_name,
    caseOwnerUserId: user.id,
    caseOwnerName: account.display_name,
    triagePriority: 'priority',
    assignedReviewPath: 'medic',
    contactOutcome: 'not_contacted_yet',
    followUpRequired: typeof body.followUpScheduledAt === 'string' && body.followUpScheduledAt ? true : false,
    followUpScheduledAt: typeof body.followUpScheduledAt === 'string' && body.followUpScheduledAt ? body.followUpScheduledAt : null,
    supportPersonContacted: Boolean(body.supportPersonContacted),
    eapReferralOffered: Boolean(body.eapReferralOffered),
    externalPsychologyReferralOffered: Boolean(body.externalPsychologyReferralOffered),
  }

  const { data, error } = await supabase
    .from('module_submissions')
    .insert({
      business_id: account.business_id,
      site_id,
      worker_id: typeof body.workerId === 'string' && body.workerId ? body.workerId : null,
      module_key: 'psychosocial_health',
      module_version: 1,
      status: 'in_medic_review',
      payload,
      review_payload,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create post-incident welfare case.' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
