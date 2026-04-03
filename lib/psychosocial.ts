import type {
  PsychosocialAssignedReviewPath,
  PsychosocialAssessment,
  PsychosocialAssessmentStatus,
  PsychosocialContactOutcome,
  PsychosocialHazardKey,
  PsychosocialPostIncidentEventType,
  PsychosocialPulseContext,
  PsychosocialRiskLevel,
  PsychosocialWorkflowKind,
} from '@/lib/types'

export const PSYCHOSOCIAL_MIN_COHORT = 5

export const PSYCHOSOCIAL_HAZARDS: Array<{
  key: PsychosocialHazardKey
  label: string
  group: 'Work Design & Organisation' | 'Workplace Behaviours & Interactions' | 'Environmental & Situational' | 'Additional'
  displayOrder: number
}> = [
  { key: 'high_job_demands', label: 'High job demands', group: 'Work Design & Organisation', displayOrder: 1 },
  { key: 'low_job_demands', label: 'Low job demands', group: 'Work Design & Organisation', displayOrder: 2 },
  { key: 'low_job_control', label: 'Low job control', group: 'Work Design & Organisation', displayOrder: 3 },
  { key: 'poor_support', label: 'Poor support', group: 'Work Design & Organisation', displayOrder: 4 },
  { key: 'lack_of_role_clarity', label: 'Lack of role clarity', group: 'Work Design & Organisation', displayOrder: 5 },
  { key: 'poor_organisational_change_management', label: 'Poor organisational change management', group: 'Work Design & Organisation', displayOrder: 6 },
  { key: 'poor_organisational_justice', label: 'Poor organisational justice', group: 'Work Design & Organisation', displayOrder: 7 },
  { key: 'low_reward_and_recognition', label: 'Low reward and recognition', group: 'Work Design & Organisation', displayOrder: 8 },
  { key: 'job_insecurity', label: 'Job insecurity', group: 'Work Design & Organisation', displayOrder: 9 },
  { key: 'violence_and_aggression', label: 'Violence and aggression', group: 'Workplace Behaviours & Interactions', displayOrder: 10 },
  { key: 'bullying', label: 'Bullying', group: 'Workplace Behaviours & Interactions', displayOrder: 11 },
  { key: 'harassment_including_sexual_harassment', label: 'Harassment including sexual harassment', group: 'Workplace Behaviours & Interactions', displayOrder: 12 },
  { key: 'remote_or_isolated_work', label: 'Remote or isolated work', group: 'Environmental & Situational', displayOrder: 13 },
  { key: 'poor_physical_environment', label: 'Poor physical environment', group: 'Environmental & Situational', displayOrder: 14 },
  { key: 'traumatic_events_or_material', label: 'Traumatic events or material', group: 'Environmental & Situational', displayOrder: 15 },
  { key: 'fatigue', label: 'Fatigue', group: 'Additional', displayOrder: 16 },
  { key: 'intrusive_surveillance', label: 'Intrusive surveillance', group: 'Additional', displayOrder: 17 },
]

export interface PsychosocialHazardMetric {
  metric_group: string
  display_order: number
  metric_key: PsychosocialHazardKey
  metric_label: string
  affected_workers: number | null
  cohort_workers: number | null
  prevalence_percent: number | null
  is_suppressed: boolean
}

export function formatPsychosocialWorkflowKind(value: PsychosocialWorkflowKind) {
  switch (value) {
    case 'wellbeing_pulse':
      return 'Wellbeing Pulse'
    case 'support_check_in':
      return 'Support Check-In'
    case 'post_incident_psychological_welfare':
      return 'Post-Incident Welfare'
  }
}

export function formatPsychosocialRiskLevel(value: PsychosocialRiskLevel) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function formatPsychosocialStatus(value: PsychosocialAssessmentStatus) {
  switch (value) {
    case 'worker_only_complete':
      return 'Worker Only'
    case 'review_recommended':
      return 'Review Recommended'
    case 'awaiting_medic_review':
      return 'Awaiting Review'
    case 'in_medic_review':
      return 'In Review'
    case 'awaiting_follow_up':
      return 'Awaiting Follow-Up'
    case 'resolved':
      return 'Resolved'
  }
}

export function formatPsychosocialContext(value: PsychosocialPulseContext) {
  switch (value) {
    case 'scheduled_check_in':
      return 'Scheduled check-in'
    case 'self_initiated_check_in':
      return 'Self-initiated check-in'
    case 'post_shift_concern':
      return 'Post-shift concern'
    case 'manager_or_peer_prompted':
      return 'Manager or peer prompted'
    case 'post_incident_follow_up':
      return 'Post-incident follow-up'
  }
}

export function getPsychosocialHazardSignals(assessment: Pick<PsychosocialAssessment, 'payload'>): PsychosocialHazardKey[] {
  const counts = assessment.payload.scoreSummary.domainSignalCounts ?? {}
  return PSYCHOSOCIAL_HAZARDS
    .filter((hazard) => Number(counts[hazard.key] ?? 0) > 0)
    .map((hazard) => hazard.key)
}

export function getPsychosocialWorkflowKind(assessment: Pick<PsychosocialAssessment, 'payload'>): PsychosocialWorkflowKind | null {
  if (assessment.payload.workerPulse?.workflowKind) return assessment.payload.workerPulse.workflowKind
  if (assessment.payload.postIncidentWelfare) return 'post_incident_psychological_welfare'
  return null
}

export function getPsychosocialWorkerName(assessment: Pick<PsychosocialAssessment, 'payload'>) {
  return assessment.payload.workerPulse?.workerNameSnapshot
    || assessment.payload.postIncidentWelfare?.workerNameSnapshot
    || 'Unknown worker'
}

export function getPsychosocialJobRole(assessment: Pick<PsychosocialAssessment, 'payload'>) {
  return assessment.payload.workerPulse?.jobRole
    || assessment.payload.postIncidentWelfare?.jobRole
    || ''
}

export function formatPsychosocialAssignedReviewPath(value: PsychosocialAssignedReviewPath | null | undefined) {
  switch (value) {
    case 'medic':
      return 'Medic'
    case 'welfare_or_counsellor':
      return 'Welfare or counsellor'
    case 'either':
      return 'Either'
    case 'external_provider':
      return 'External provider'
    default:
      return 'Not set'
  }
}

export function formatPsychosocialContactOutcome(value: PsychosocialContactOutcome | null | undefined) {
  switch (value) {
    case 'not_contacted_yet':
      return 'Not contacted yet'
    case 'contact_attempted':
      return 'Contact attempted'
    case 'contact_completed':
      return 'Contact completed'
    case 'worker_declined':
      return 'Worker declined'
    case 'referred':
      return 'Referred'
    case 'monitor_only':
      return 'Monitor only'
    default:
      return 'Not set'
  }
}

export function formatPsychosocialPostIncidentEventType(value: PsychosocialPostIncidentEventType) {
  switch (value) {
    case 'witnessed_serious_injury':
      return 'Witnessed serious injury'
    case 'witnessed_death':
      return 'Witnessed death'
    case 'involved_in_cpr':
      return 'Involved in CPR'
    case 'personally_injured':
      return 'Personally injured'
    case 'serious_near_miss':
      return 'Serious near miss'
    case 'distressing_behavioural_incident':
      return 'Distressing behavioural incident'
    case 'other':
      return 'Other'
  }
}

export function buildPsychosocialHazardMetrics(
  assessments: Array<Pick<PsychosocialAssessment, 'worker_id' | 'payload'>>,
  minCohort = PSYCHOSOCIAL_MIN_COHORT,
): PsychosocialHazardMetric[] {
  const cohortWorkers = new Set(assessments.map((item) => item.worker_id).filter(Boolean)).size
  const suppressed = cohortWorkers < Math.max(minCohort, 1)

  return PSYCHOSOCIAL_HAZARDS.map((hazard) => {
    const affectedWorkers = new Set<string>()
    for (const item of assessments) {
      if (!item.worker_id) continue
      const signalCount = Number(item.payload.scoreSummary.domainSignalCounts?.[hazard.key] ?? 0)
      if (signalCount > 0) affectedWorkers.add(item.worker_id)
    }

    const affected = affectedWorkers.size
    const prevalence = cohortWorkers > 0 ? Number(((affected / cohortWorkers) * 100).toFixed(2)) : 0

    return {
      metric_group: hazard.group,
      display_order: hazard.displayOrder,
      metric_key: hazard.key,
      metric_label: hazard.label,
      affected_workers: suppressed ? null : affected,
      cohort_workers: suppressed ? null : cohortWorkers,
      prevalence_percent: suppressed ? null : prevalence,
      is_suppressed: suppressed,
    }
  })
}
