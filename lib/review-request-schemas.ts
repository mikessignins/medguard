import { z } from 'zod'

const REVIEWABLE_SUBMISSION_STATUSES = ['In Review', 'Approved', 'Requires Follow-up'] as const
const MEDICATION_REVIEW_STATUSES = ['Pending', 'In Review', 'Normal Duties', 'Restricted Duties', 'Unfit for Work'] as const
const FATIGUE_REVIEW_DECISIONS = [
  'fit_normal_duties',
  'fit_restricted_duties',
  'not_fit_for_work',
  'sent_to_room',
  'sent_home',
  'requires_escalation',
] as const
const PSYCHOSOCIAL_NEXT_STATUSES = ['awaiting_follow_up', 'resolved'] as const
const PSYCHOSOCIAL_TRIAGE_PRIORITIES = ['routine', 'priority', 'urgent'] as const
const PSYCHOSOCIAL_ASSIGNED_REVIEW_PATHS = ['medic', 'welfare_or_counsellor', 'either', 'external_provider'] as const
const PSYCHOSOCIAL_CONTACT_OUTCOMES = ['not_contacted_yet', 'contact_attempted', 'contact_completed', 'worker_declined', 'referred', 'monitor_only'] as const
const PSYCHOSOCIAL_CLOSURE_REASONS = ['support_provided', 'monitoring_complete', 'referred_to_eap', 'referred_to_external_psychology', 'worker_declined_support', 'other'] as const
const PSYCHOSOCIAL_POST_INCIDENT_EVENT_TYPES = [
  'witnessed_serious_injury',
  'witnessed_death',
  'involved_in_cpr',
  'personally_injured',
  'serious_near_miss',
  'distressing_behavioural_incident',
  'other',
] as const

function requiredTrimmedString(message: string) {
  return z.string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message })
}

function requiredTrimmedLimitedString(message: string, maxLength: number, maxMessage: string) {
  return z.string()
    .trim()
    .min(1, message)
    .max(maxLength, maxMessage)
}

function nullableTrimmedString() {
  return z.union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : null
    })
}

function optionalBoolean() {
  return z.boolean().optional()
}

const BULK_OPERATION_IDS_LIMIT = 100

const bulkIdsSchema = z.object({
  ids: z.array(z.string().uuid('Each selected record must be a valid ID.'))
    .max(BULK_OPERATION_IDS_LIMIT, `You can select up to ${BULK_OPERATION_IDS_LIMIT} records at a time.`)
    .transform((ids) => Array.from(new Set(ids))),
})

export const adminAuditRequestSchema = z.object({
  action: requiredTrimmedLimitedString('action is required', 120, 'action is too long'),
  target_user_id: nullableTrimmedString().optional(),
  target_name: nullableTrimmedString().optional(),
  detail: z.record(z.unknown()).nullish(),
})

export const submissionCommentRequestSchema = z.object({
  note: requiredTrimmedLimitedString('note is required', 4000, 'note is too long'),
  outcome: nullableTrimmedString().optional(),
})

export const emergencyPurgeRequestSchema = bulkIdsSchema
export const fatiguePurgeRequestSchema = bulkIdsSchema
export const medicationPurgeRequestSchema = bulkIdsSchema
export const psychosocialPurgeRequestSchema = bulkIdsSchema

export const emergencyReviewRequestSchema = z.object({
  status: z.enum(REVIEWABLE_SUBMISSION_STATUSES),
  note: nullableTrimmedString().optional(),
  version: z.union([z.number().int().nonnegative(), z.null(), z.undefined()]).transform((value) => (
    typeof value === 'number' ? value : undefined
  )),
})

export const medicationReviewRequestSchema = z.object({
  medic_review_status: z.enum(MEDICATION_REVIEW_STATUSES),
  medic_comments: nullableTrimmedString().optional(),
  review_required: z.boolean().optional().default(false),
})

export const fatigueReviewRequestSchema = z.object({
  fitForWorkDecision: z.enum(FATIGUE_REVIEW_DECISIONS),
  restrictions: nullableTrimmedString().optional(),
  supervisorNotified: optionalBoolean(),
  handoverNotes: nullableTrimmedString().optional(),
  transportArranged: optionalBoolean(),
  sentToRoom: optionalBoolean(),
  sentHome: optionalBoolean(),
  requiresHigherMedicalReview: optionalBoolean(),
  requiresFollowUp: optionalBoolean(),
  medicOrEsoComments: nullableTrimmedString().optional(),
})

export const psychosocialReviewRequestSchema = z.object({
  nextStatus: z.enum(PSYCHOSOCIAL_NEXT_STATUSES).optional().default('resolved'),
  triagePriority: z.enum(PSYCHOSOCIAL_TRIAGE_PRIORITIES).nullish(),
  assignedReviewPath: z.enum(PSYCHOSOCIAL_ASSIGNED_REVIEW_PATHS).nullish(),
  caseOwnerName: nullableTrimmedString().optional(),
  caseOwnerUserId: nullableTrimmedString().optional(),
  contactOutcome: z.enum(PSYCHOSOCIAL_CONTACT_OUTCOMES).nullish(),
  supportPersonContacted: z.boolean().nullish(),
  eapReferralOffered: z.boolean().nullish(),
  externalPsychologyReferralOffered: z.boolean().nullish(),
  followUpScheduledAt: nullableTrimmedString().optional(),
  closureReason: z.enum(PSYCHOSOCIAL_CLOSURE_REASONS).nullish(),
  outcomeSummary: requiredTrimmedString('An outcome summary is required.'),
  supportActions: nullableTrimmedString().optional(),
  followUpRequired: z.boolean().nullish(),
  reviewComments: nullableTrimmedString().optional(),
})

export const psychosocialPostIncidentRequestSchema = z.object({
  site_id: requiredTrimmedString('Site is required.'),
  workerNameSnapshot: requiredTrimmedString('Worker name is required.'),
  workerId: z.union([
    z.string().uuid('Worker account ID must be a valid ID.'),
    z.null(),
    z.undefined(),
  ]).transform((value) => value ?? null).optional(),
  jobRole: nullableTrimmedString().optional(),
  linkedIncidentOrCaseId: nullableTrimmedString().optional(),
  eventType: z.enum(PSYCHOSOCIAL_POST_INCIDENT_EVENT_TYPES),
  eventDateTime: requiredTrimmedString('Event date and time is required.'),
  natureOfExposure: requiredTrimmedString('Nature of exposure is required.'),
  initialDefusingOffered: z.boolean(),
  normalReactionsExplained: z.boolean(),
  supportPersonContacted: z.boolean(),
  eapReferralOffered: z.boolean(),
  externalPsychologyReferralOffered: z.boolean(),
  followUpScheduledAt: nullableTrimmedString().optional(),
  confidentialityAcknowledged: z.boolean(),
  reviewNotes: nullableTrimmedString().optional(),
})
