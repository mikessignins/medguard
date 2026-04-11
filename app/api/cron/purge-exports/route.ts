import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  createErrorId,
  getRequiredSecret,
  internalServerError,
  logAndReturnInternalError,
  logApiError,
} from '@/lib/api-security'

// Vercel invokes this daily with Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const cronSecret = getRequiredSecret('CRON_SECRET', 32)
  if (!cronSecret) {
    const errorId = createErrorId()
    logApiError('/api/cron/purge-exports', errorId, 'CRON_SECRET is missing or too short')
    return internalServerError(errorId)
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Find submissions exported more than 7 days ago that haven't been purged yet
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const purgedAt = new Date().toISOString()

  // ── Submissions ─────────────────────────────────────────────────────────────
  const { data: subTargets, error: subFetchError } = await supabase
    .from('submissions')
    .select('id, business_id, site_id, site_name, worker_snapshot, exported_at, exported_by_name, decision')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (subFetchError) return logAndReturnInternalError('/api/cron/purge-exports', subFetchError)

  let subsPurged = 0
  if (subTargets && subTargets.length > 0) {
    const subAuditRows = subTargets.map(sub => {
      const ws       = sub.worker_snapshot as Record<string, unknown> | null
      const decision = sub.decision as Record<string, unknown> | null
      return {
        submission_id:     sub.id,
        worker_name:       (ws?.fullName as string) ?? null,
        worker_dob:        (ws?.dateOfBirth as string) ?? null,
        site_id:           sub.site_id ?? null,
        site_name:         sub.site_name ?? null,
        business_id:       sub.business_id,
        medic_user_id:     null,
        medic_name:        'Auto-purge (system)',
        purged_at:         purgedAt,
        form_type:         'emergency_declaration',
        exported_at:       sub.exported_at ?? null,
        exported_by_name:  sub.exported_by_name ?? null,
        approved_by_name:  (decision?.decided_by_name as string) ?? null,
        approved_at:       (decision?.decided_at as string) ?? null,
      }
    })

    const { error: subUpdateError } = await supabase
      .from('submissions')
      .update({
        phi_purged_at: purgedAt,
        worker_snapshot: null,
        script_uploads: null,
      })
      .in('id', subTargets.map(r => r.id))

    if (subUpdateError) return logAndReturnInternalError('/api/cron/purge-exports', subUpdateError)

    if (subAuditRows.length > 0) {
      const { error: subAuditError } = await supabase.from('purge_audit_log').insert(subAuditRows)
      if (subAuditError) return logAndReturnInternalError('/api/cron/purge-exports', subAuditError)
    }
    subsPurged = subTargets.length
  }

  // ── Medication Declarations ──────────────────────────────────────────────────
  const { data: medTargets, error: medFetchError } = await supabase
    .from('medication_declarations')
    .select('id, business_id, site_id, site_name, worker_name, worker_dob, exported_at, exported_by_name, medic_name, medic_reviewed_at')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (medFetchError) return logAndReturnInternalError('/api/cron/purge-exports', medFetchError)

  let medsPurged = 0
  if (medTargets && medTargets.length > 0) {
    const medAuditRows = medTargets.map(m => ({
      submission_id:     m.id,
      worker_name:       m.worker_name ?? null,
      worker_dob:        m.worker_dob ?? null,
      site_id:           m.site_id ?? null,
      site_name:         m.site_name ?? null,
      business_id:       m.business_id,
      medic_user_id:     null,
      medic_name:        'Auto-purge (system)',
      purged_at:         purgedAt,
      form_type:         'medication_declaration',
      exported_at:       m.exported_at ?? null,
      exported_by_name:  m.exported_by_name ?? null,
      approved_by_name:  m.medic_name ?? null,
      approved_at:       m.medic_reviewed_at ?? null,
    }))

    const { error: medUpdateError } = await supabase
      .from('medication_declarations')
      .update({
        phi_purged_at: purgedAt,
        worker_name: '',
        worker_dob: '',
        employer: '',
        department: '',
        job_title: '',
        medications: [],
        script_uploads: [],
      })
      .in('id', medTargets.map(r => r.id))

    if (medUpdateError) return logAndReturnInternalError('/api/cron/purge-exports', medUpdateError)

    if (medAuditRows.length > 0) {
      const { error: medAuditError } = await supabase.from('purge_audit_log').insert(medAuditRows)
      if (medAuditError) return logAndReturnInternalError('/api/cron/purge-exports', medAuditError)
    }
    medsPurged = medTargets.length
  }

  // ── Fatigue Module Submissions ───────────────────────────────────────────────
  const { data: fatigueTargets, error: fatigueFetchError } = await supabase
    .from('module_submissions')
    .select('id, business_id, site_id, payload, review_payload, exported_at, exported_by_name, module_key, reviewed_at')
    .eq('module_key', 'fatigue_assessment')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (fatigueFetchError) return logAndReturnInternalError('/api/cron/purge-exports', fatigueFetchError)

  let fatiguePurged = 0
  if (fatigueTargets && fatigueTargets.length > 0) {
    const fatigueAuditRows = fatigueTargets.map((entry) => {
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
        medic_user_id: null,
        medic_name: 'Auto-purge (system)',
        purged_at: purgedAt,
        form_type: 'fatigue_assessment',
        exported_at: entry.exported_at ?? null,
        exported_by_name: entry.exported_by_name ?? null,
        approved_by_name: (reviewPayload?.reviewedByName as string) ?? null,
        approved_at: entry.reviewed_at ?? null,
      }
    })
    const { error: fatigueUpdateError } = await supabase
      .from('module_submissions')
      .update({
        phi_purged_at: purgedAt,
        payload: {},
        review_payload: {},
      })
      .eq('module_key', 'fatigue_assessment')
      .in('id', fatigueTargets.map((row) => row.id))

    if (fatigueUpdateError) return logAndReturnInternalError('/api/cron/purge-exports', fatigueUpdateError)

    if (fatigueAuditRows.length > 0) {
      const { error: fatigueAuditError } = await supabase.from('purge_audit_log').insert(fatigueAuditRows)
      if (fatigueAuditError) return logAndReturnInternalError('/api/cron/purge-exports', fatigueAuditError)
    }
    fatiguePurged = fatigueTargets.length
  }

  // ── Psychosocial Support Check-Ins ──────────────────────────────────────────
  const { data: psychosocialTargets, error: psychosocialFetchError } = await supabase
    .from('module_submissions')
    .select('id, business_id, site_id, payload, review_payload, exported_at, exported_by_name, module_key, reviewed_at')
    .eq('module_key', 'psychosocial_health')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (psychosocialFetchError) return logAndReturnInternalError('/api/cron/purge-exports', psychosocialFetchError)

  const psychosocialSupportTargets = (psychosocialTargets ?? []).filter(
    (entry) => {
      const workflowKind = entry.payload?.workerPulse?.workflowKind
        ?? (entry.payload?.postIncidentWelfare ? 'post_incident_psychological_welfare' : null)
      return ['support_check_in', 'post_incident_psychological_welfare'].includes(workflowKind ?? '')
    },
  )

  let psychosocialPurged = 0
  if (psychosocialSupportTargets.length > 0) {
    const psychosocialAuditRows = psychosocialSupportTargets.map((entry) => {
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
        medic_user_id: null,
        medic_name: 'Auto-purge (system)',
        purged_at: purgedAt,
        form_type: entry.payload?.postIncidentWelfare ? 'psychosocial_post_incident_welfare' : 'psychosocial_support_checkin',
        exported_at: entry.exported_at ?? null,
        exported_by_name: entry.exported_by_name ?? null,
        approved_by_name: (reviewPayload?.reviewedByName as string) ?? null,
        approved_at: entry.reviewed_at ?? null,
      }
    })
    const { error: psychosocialUpdateError } = await supabase
      .from('module_submissions')
      .update({
        phi_purged_at: purgedAt,
        payload: {},
        review_payload: {},
      })
      .eq('module_key', 'psychosocial_health')
      .in('id', psychosocialSupportTargets.map((row) => row.id))

    if (psychosocialUpdateError) return logAndReturnInternalError('/api/cron/purge-exports', psychosocialUpdateError)

    if (psychosocialAuditRows.length > 0) {
      const { error: psychosocialAuditError } = await supabase.from('purge_audit_log').insert(psychosocialAuditRows)
      if (psychosocialAuditError) return logAndReturnInternalError('/api/cron/purge-exports', psychosocialAuditError)
    }
    psychosocialPurged = psychosocialSupportTargets.length
  }

  const result = {
    submissions_purged: subsPurged,
    med_declarations_purged: medsPurged,
    fatigue_assessments_purged: fatiguePurged,
    psychosocial_support_checkins_purged: psychosocialPurged,
  }

  // Record successful run so admin dashboard can detect silent cron failures
  await supabase.from('cron_health_log').upsert(
    { cron_name: 'purge-exports', last_run_at: new Date().toISOString(), last_result: result },
    { onConflict: 'cron_name' }
  )

  return NextResponse.json(result)
}
