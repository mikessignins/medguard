export type UserRole = 'worker' | 'medic' | 'admin' | 'pending_medic' | 'superuser'

export type SubmissionStatus = 'New' | 'In Review' | 'Approved' | 'Requires Follow-up' | 'Recalled'

export type FeedbackCategory = 'Bug' | 'Error' | 'Idea' | 'Other'
export type FeedbackStatus = 'Unread' | 'Read' | 'Planned' | 'Implemented' | 'Archived'

export interface FeedbackItem {
  id: string
  submitted_at: string
  submitted_by_user_id: string | null
  submitted_by_name: string | null
  submitted_by_role: string
  business_id: string | null
  business_name: string | null
  category: FeedbackCategory
  message: string
  status: FeedbackStatus
  superuser_note: string | null
  status_updated_at: string | null
}

export interface UserAccount {
  id: string
  business_id: string
  display_name: string
  email: string
  role: UserRole
  site_ids: string[]
  contract_end_date: string | null
  preferred_language?: string | null
}

export interface Business {
  id: string
  name: string
  contact_email: string
  is_suspended?: boolean
  trial_until?: string | null
  reminder_interval_months?: number
  logo_url?: string | null
  logo_url_light?: string | null
  logo_url_dark?: string | null
}

export type MedDecReviewStatus = 'Pending' | 'In Review' | 'Normal Duties' | 'Restricted Duties' | 'Unfit for Work'

export interface MedDecMedication {
  id: string
  name: string
  prescriptionType: string
  dosagePerDay: string
  duration: string
  medicationClass: string
  flaggedForSideEffects: boolean
  isLongTerm: boolean
}

export interface MedicationDeclaration {
  id: string
  business_id: string
  site_id: string
  site_name?: string | null
  worker_id: string
  worker_name: string
  worker_dob: string
  employer: string
  department: string
  job_title: string
  has_recent_injury_or_illness: boolean
  has_side_effects: boolean
  medications: MedDecMedication[]
  submitted_at: string
  medic_review_status: MedDecReviewStatus
  medic_name: string
  medic_comments: string
  review_required: boolean
  medic_reviewed_at: string | null
  script_uploads: ScriptUpload[]
  exported_at: string | null
  exported_by_name?: string | null
  phi_purged_at: string | null
  is_test?: boolean
}

export interface Site {
  id: string
  business_id: string
  name: string
  latitude: number | null
  longitude: number | null
  is_office: boolean
  medic_phone: string | null
  eso_name: string | null
  safety_manager_name: string | null
  village_admin_name: string | null
}

export interface Medication {
  id?: string
  name: string
  dosage: string
  frequency: string
  reviewFlag: string
}

export interface WorkerSnapshot {
  fullName: string
  dateOfBirth: string
  emailAddress: string
  mobileNumber: string
  company: string
  department: string
  supervisor?: string
  siteLocation?: string
  employeeId: string
  isContractor: boolean
  heightCm: number | null
  weightKg: number | null
  emergencyContactName: string
  emergencyContactMobile: string
  emergencyContactRelationship?: string
  emergencyContactOther?: string
  allergies: string
  anaphylactic: boolean
  currentMedications: Medication[]
  hasPrescriptions: boolean
  tetanus: { immunised: boolean; lastDoseDate: string | null }
  hepatitisB: { immunised: boolean; lastDoseDate: string | null }
  conditionChecklist: Record<string, { id?: string; label: string; hint?: string; answer: boolean; detail: string }>
}

export interface ScriptUpload {
  medicationId: string
  medicationName: string
  storagePath: string
  downloadURL?: string | null
  signedUrl?: string | null  // generated server-side, not stored in DB
}

export interface Decision {
  outcome: string
  note?: string
  decided_by_user_id: string
  decided_by_name?: string
  decided_at: string
}

export interface MedicComment {
  id: string
  medic_user_id: string
  medic_name: string
  note: string
  outcome?: string | null
  created_at: string
  edited_at?: string | null
}

export interface Submission {
  id: string
  business_id: string
  site_id: string
  site_name?: string | null
  worker_id: string
  worker_snapshot: WorkerSnapshot
  role: string
  visit_date: string
  shift_type: string
  status: SubmissionStatus
  consent_given: boolean
  submitted_at: string
  site_specific_answers: Record<string, unknown>
  decision: Decision | null
  exported_at: string | null
  exported_by_name?: string | null
  phi_purged_at: string | null
  comments: MedicComment[]
  version?: number
  is_test?: boolean
}

export interface WorkerMembership {
  id: string
  worker_id: string
  business_id: string
  role: string
  site_ids: string[]
  joined_at: string
  is_active: boolean
}

export type FatigueAssessmentContext =
  | 'pre_shift'
  | 'during_shift'
  | 'post_shift'
  | 'journey_management'
  | 'peer_or_supervisor_concern'
  | 'other'

export type FatigueAlertnessRating =
  | 'a_active_alert_wide_awake'
  | 'b_functioning_well_not_peak'
  | 'c_ok_but_not_fully_alert'
  | 'd_groggy_hard_to_concentrate'
  | 'e_sleepy_would_like_to_lie_down'

export type FatigueAlcoholBeforeSleepBand =
  | 'none'
  | 'one_to_two'
  | 'three_to_four'
  | 'five_or_more'

export type FatigueRiskLevel = 'low' | 'medium' | 'high'

export type FatigueAssessmentQueueStatus =
  | 'worker_only_complete'
  | 'awaiting_medic_review'
  | 'in_medic_review'
  | 'resolved'

export type FatigueReviewDecision =
  | 'fit_normal_duties'
  | 'fit_restricted_duties'
  | 'not_fit_for_work'
  | 'sent_to_room'
  | 'sent_home'
  | 'requires_escalation'

export interface FatigueWorkerAssessmentPayload {
  assessmentContext: FatigueAssessmentContext
  workerNameSnapshot: string
  jobRole: string
  workgroup?: string | null
  rosterPattern?: string | null
  currentShiftStartAt?: string | null
  plannedShiftEndAt?: string | null
  sleepHoursLast24h: number
  sleepHoursLast48h: number
  hoursAwakeByEndOfShift: number
  alertnessRating: FatigueAlertnessRating
  alcoholBeforeSleepBand: FatigueAlcoholBeforeSleepBand
  drowsyMedicationOrSubstance: boolean
  stressOrHealthIssueAffectingSleepOrConcentration: boolean
  drivingAfterShift: boolean
  commuteDurationMinutes?: number | null
  workerComments?: string | null
}

export interface FatigueWorkerScoreSummary {
  fatigueScoreTotal: number
  hasAnyHighRiskAnswer: boolean
  derivedRiskLevel: FatigueRiskLevel
}

export interface FatigueModulePayload {
  workerAssessment: FatigueWorkerAssessmentPayload
  workerScoreSummary: FatigueWorkerScoreSummary
}

export interface FatigueMedicReviewPayload {
  reviewStartedAt?: string | null
  reviewedByUserId?: string | null
  reviewedByName?: string | null
  fitForWorkDecision?: FatigueReviewDecision | null
  restrictions?: string | null
  supervisorNotified?: boolean | null
  handoverNotes?: string | null
  transportArranged?: boolean | null
  sentToRoom?: boolean | null
  sentHome?: boolean | null
  requiresHigherMedicalReview?: boolean | null
  requiresFollowUp?: boolean | null
  medicOrEsoComments?: string | null
}

export interface FatigueAssessment {
  id: string
  business_id: string
  site_id: string
  worker_id: string
  module_key: 'fatigue_assessment'
  module_version: number
  status: FatigueAssessmentQueueStatus
  payload: FatigueModulePayload
  review_payload: FatigueMedicReviewPayload
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  exported_at?: string | null
  exported_by_name?: string | null
  phi_purged_at?: string | null
}

export type PsychosocialWorkflowKind =
  | 'wellbeing_pulse'
  | 'support_check_in'
  | 'post_incident_psychological_welfare'

export type PsychosocialPulseContext =
  | 'scheduled_check_in'
  | 'self_initiated_check_in'
  | 'post_shift_concern'
  | 'manager_or_peer_prompted'
  | 'post_incident_follow_up'

export type PsychosocialFrequencyOption =
  | 'not_at_all'
  | 'a_little'
  | 'sometimes'
  | 'often'
  | 'very_often'

export type PsychosocialControlOption =
  | 'always'
  | 'mostly'
  | 'sometimes'
  | 'rarely'
  | 'never'

export type PsychosocialSupportContactOption = 'no' | 'maybe' | 'yes'

export type PsychosocialRiskLevel = 'low' | 'moderate' | 'high' | 'critical'

export type PsychosocialAssessmentStatus =
  | 'worker_only_complete'
  | 'review_recommended'
  | 'awaiting_medic_review'
  | 'in_medic_review'
  | 'awaiting_follow_up'
  | 'resolved'

export type PsychosocialReviewPriority = 'routine' | 'priority' | 'urgent'

export type PsychosocialAssignedReviewPath =
  | 'medic'
  | 'welfare_or_counsellor'
  | 'either'
  | 'external_provider'

export type PsychosocialContactOutcome =
  | 'not_contacted_yet'
  | 'contact_attempted'
  | 'contact_completed'
  | 'worker_declined'
  | 'referred'
  | 'monitor_only'

export type PsychosocialCaseClosureReason =
  | 'support_provided'
  | 'monitoring_complete'
  | 'referred_to_eap'
  | 'referred_to_external_psychology'
  | 'worker_declined_support'
  | 'other'

export type PsychosocialPostIncidentEventType =
  | 'witnessed_serious_injury'
  | 'witnessed_death'
  | 'involved_in_cpr'
  | 'personally_injured'
  | 'serious_near_miss'
  | 'distressing_behavioural_incident'
  | 'other'

export type PsychosocialHazardKey =
  | 'high_job_demands'
  | 'low_job_demands'
  | 'low_job_control'
  | 'poor_support'
  | 'lack_of_role_clarity'
  | 'poor_organisational_change_management'
  | 'poor_organisational_justice'
  | 'low_reward_and_recognition'
  | 'job_insecurity'
  | 'violence_and_aggression'
  | 'bullying'
  | 'harassment_including_sexual_harassment'
  | 'remote_or_isolated_work'
  | 'poor_physical_environment'
  | 'traumatic_events_or_material'
  | 'fatigue'
  | 'intrusive_surveillance'

export interface PsychosocialWorkerPulsePayload {
  workflowKind: PsychosocialWorkflowKind
  submissionContext: PsychosocialPulseContext
  workerNameSnapshot: string
  jobRole: string
  workgroup?: string | null
  rosterPattern?: string | null
  isFIFO: boolean
  moodRating: number
  stressRating: number
  sleepQualityOnRoster: number
  feelingOverwhelmedByWorkDemands: PsychosocialFrequencyOption
  feelingUnderUsedOrDisengaged: PsychosocialFrequencyOption
  feelingAbleToControlWork: PsychosocialControlOption
  feelingSupportedBySupervisorOrTeam: PsychosocialControlOption
  roleAndExpectationsAreClear: PsychosocialControlOption
  concernAboutUnfairTreatmentOrPoorCommunication: boolean
  recentInterpersonalConflictOrInappropriateBehaviour: boolean
  feelingIsolatedDueToRemoteOrFIFOWork: boolean
  physicalEnvironmentAffectingWellbeing: boolean
  exposedToDistressingOrTraumaticEvent: boolean
  concernAboutRosterOrFatiguePressure: boolean
  concernAboutMonitoringOrSurveillancePressure: boolean
  wouldLikeSupportContact: PsychosocialSupportContactOption
  comfortableSpeakingToMedic: boolean
  comfortableSpeakingToCounsellor: boolean
  wouldLikeUrgentContactToday: boolean
  feelsUnsafeAtWorkToday: boolean
  workerComments?: string | null
}

export interface PsychosocialWorkerScoreSummary {
  derivedPulseRiskLevel: PsychosocialRiskLevel
  domainSignalCounts: Partial<Record<PsychosocialHazardKey, number>>
  requestedSupport: boolean
  requiresReview: boolean
  requiresUrgentFollowUp: boolean
}

export interface PsychosocialPostIncidentPayload {
  linkedIncidentOrCaseId?: string | null
  workerId?: string | null
  workerNameSnapshot: string
  jobRole?: string | null
  eventType: PsychosocialPostIncidentEventType
  eventDateTime: string
  natureOfExposure: string
  initialDefusingOffered: boolean
  normalReactionsExplained: boolean
  supportPersonContacted: boolean
  eapReferralOffered: boolean
  externalPsychologyReferralOffered: boolean
  followUpScheduledAt?: string | null
  confidentialityAcknowledged: boolean
  reviewNotes?: string | null
}

export interface PsychosocialModulePayload {
  workerPulse?: PsychosocialWorkerPulsePayload
  postIncidentWelfare?: PsychosocialPostIncidentPayload
  scoreSummary: PsychosocialWorkerScoreSummary
}

export interface PsychosocialReviewPayload {
  reviewStartedAt?: string | null
  reviewedByUserId?: string | null
  reviewedByName?: string | null
  triagePriority?: PsychosocialReviewPriority | null
  assignedReviewPath?: PsychosocialAssignedReviewPath | null
  caseOwnerName?: string | null
  caseOwnerUserId?: string | null
  contactOutcome?: PsychosocialContactOutcome | null
  supportPersonContacted?: boolean | null
  eapReferralOffered?: boolean | null
  externalPsychologyReferralOffered?: boolean | null
  followUpScheduledAt?: string | null
  nextCheckInAt?: string | null
  closureReason?: PsychosocialCaseClosureReason | null
  outcomeSummary?: string | null
  supportActions?: string | null
  followUpRequired?: boolean | null
  reviewComments?: string | null
}

export interface PsychosocialAssessment {
  id: string
  business_id: string
  site_id: string
  worker_id: string
  module_key: 'psychosocial_health'
  module_version: number
  status: PsychosocialAssessmentStatus
  payload: PsychosocialModulePayload
  review_payload: PsychosocialReviewPayload
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  exported_at?: string | null
  exported_by_name?: string | null
  phi_purged_at?: string | null
  is_test?: boolean | null
}
