export type UserRole =
  | 'worker'
  | 'medic'
  | 'admin'
  | 'pending_medic'
  | 'occ_health'
  | 'pending_occ_health'
  | 'superuser'

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
  is_inactive?: boolean
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
  medical_officer_review_required?: boolean
  medical_officer_name?: string | null
  medical_officer_practice?: string | null
  medic_reviewed_at: string | null
  script_uploads: ScriptUpload[]
  exported_at: string | null
  exported_by_name?: string | null
  export_confirmed_at?: string | null
  export_confirmed_by?: string | null
  export_confirmed_by_name?: string | null
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
  eap_phone: string | null
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
  religionCulturalConsiderations?: string | null
  interpreterRequired?: boolean
  interpreterLanguage?: string | null
  company: string
  department: string
  supervisor?: string
  siteLocation?: string
  employeeId: string
  isContractor: boolean
  contractorCompanyName?: string | null
  contractorSupervisorName?: string | null
  contractorSupervisorPhone?: string | null
  contractorSupervisorEmail?: string | null
  jobRoleTitle?: string | null
  workgroup?: string | null
  rosterPattern?: string | null
  permanentRoomNumber?: string | null
  heightCm: number | null
  weightKg: number | null
  emergencyContactName: string
  emergencyContactMobile: string
  emergencyContactRelationship?: string
  emergencyContactOther?: string
  emergencyContactEmail?: string | null
  secondaryEmergencyContactName?: string | null
  secondaryEmergencyContactRelationship?: string | null
  secondaryEmergencyContactPhone?: string | null
  secondaryEmergencyContactEmail?: string | null
  noEmergencyContactAcknowledged?: boolean
  allergies: string
  allergyReactionNotes?: string | null
  anaphylactic: boolean
  adrenalineDeviceType?: string | null
  homeGpName?: string | null
  homeGpClinic?: string | null
  homeGpPhone?: string | null
  normalRestingHr?: number | null
  normalBpSystolic?: number | null
  normalBpDiastolic?: number | null
  normalBgl?: string | null
  hasHearingLoss?: boolean
  hearingAidUsed?: boolean
  hearingAffectedEar?: string | null
  hearingLossNotes?: string | null
  lastFfwMedicalDate?: string | null
  recentIllnessInjuryHospitalisation30d?: string | null
  additionalMedicalNotes?: string | null
  currentMedications: Medication[]
  hasPrescriptions: boolean
  tetanus: { immunised: boolean; lastDoseDate: string | null }
  hepatitisB: { immunised: boolean; lastDoseDate: string | null }
  qFever?: { immunised: boolean; lastDoseDate: string | null }
  conditionChecklist: Record<string, { id?: string; label: string; hint?: string; answer: boolean; detail: string }>
  bloodBorneVirusTypes?: string[]
  analyticsConsentDeidentified?: boolean
  emergencyDataSharingConsent?: boolean
  profileReviewDueDate?: string | null
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
  export_confirmed_at?: string | null
  export_confirmed_by?: string | null
  export_confirmed_by_name?: string | null
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

export type WorkerRoleSource = 'catalogue' | 'other'

export interface BusinessWorkerRole {
  id: string
  business_id: string
  name: string
  normalized_name: string
  is_active: boolean
  sort_order: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkerOperationalProfile {
  id: string
  worker_user_id: string
  business_id: string
  worker_display_name: string
  selected_worker_role_id: string | null
  job_role_name: string
  job_role_source: WorkerRoleSource
  other_role_text: string | null
  requires_health_surveillance: boolean
  surveillance_declared_at: string | null
  created_at: string
  updated_at: string
}

export interface BusinessWorkerRoleSuggestion {
  id: string
  business_id: string
  worker_user_id: string
  submitted_text: string
  normalized_text: string
  status: 'pending' | 'approved' | 'merged' | 'rejected'
  approved_role_id: string | null
  created_at: string
  updated_at: string
}

export type SurveillanceProgramCode =
  | 'general'
  | 'respiratory'
  | 'hearing'
  | 'chemical'
  | 'dust'
  | 'other'

export type SurveillanceTypeCode = string

export type SurveillanceEnrolmentStatus = 'active' | 'paused' | 'completed' | 'removed'

export type SurveillanceAppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'rescheduled'
  | 'cancelled'
  | 'did_not_attend'

export type SurveillanceOutcomeStatus =
  | 'completed'
  | 'followup_required'
  | 'external_review_required'
  | 'temporary_restriction'
  | 'cleared'

export type SurveillanceWorkerSource = 'app_user' | 'manual_entry'

export interface SurveillanceType {
  id: string
  business_id: string
  code: SurveillanceTypeCode
  name: string
  description: string | null
  default_interval_days: number
  baseline_interval_days: number | null
  legacy_program_code: SurveillanceProgramCode | null
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceTypeFrequencyRule {
  id: string
  business_id: string
  surveillance_type_id: string
  site_id: string | null
  worker_role_id: string | null
  seg_code: string | null
  hazard_code: string | null
  baseline_interval_days: number | null
  recurring_interval_days: number
  priority: number
  is_active: boolean
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceAssignmentRule {
  id: string
  business_id: string
  surveillance_type_id: string
  site_id: string | null
  worker_role_id: string | null
  seg_code: string | null
  hazard_code: string | null
  exposure_level_category: string | null
  baseline_required: boolean
  is_active: boolean
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceReasonCode {
  id: string
  business_id: string
  category: 'cancelled' | 'rescheduled' | 'did_not_attend' | 'review_required' | 'deactivated'
  code: string
  label: string
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceProvider {
  id: string
  business_id: string
  name: string
  provider_type: string | null
  contact_email: string | null
  contact_phone: string | null
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceProviderLocation {
  id: string
  provider_id: string
  business_id: string
  site_id: string | null
  location_name: string
  address_text: string | null
  supports_remote: boolean
  capacity_notes: string | null
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceNotification {
  id: string
  business_id: string
  surveillance_worker_id: string
  appointment_id: string | null
  enrolment_id: string | null
  notification_type: string
  delivery_channel: string
  scheduled_for: string
  sent_at: string | null
  delivery_status: 'pending' | 'sent' | 'failed' | 'acknowledged' | 'cancelled'
  template_version: string | null
  provider_message_id?: string | null
  delivery_error?: string | null
  attempt_count?: number
  last_attempted_at?: string | null
  created_by: string | null
  created_at: string
}

export interface SurveillanceNotificationRecipient {
  id: string
  notification_id: string
  business_id: string
  target_user_id: string | null
  target_role: string | null
  delivery_address: string | null
  acknowledged_at: string | null
  created_at: string
}

export interface SurveillanceEscalationPolicy {
  business_id: string
  due_soon_days: number
  occ_health_overdue_days: number
  supervisor_overdue_days: number
  manager_overdue_days: number
  is_active: boolean
  created_at: string
  updated_by: string | null
  updated_at: string
}

export interface SurveillanceWorkerRoster {
  id: string
  business_id: string
  surveillance_worker_id: string
  roster_pattern: string
  shift_type: string | null
  current_swing_start: string | null
  current_swing_end: string | null
  source_system: string | null
  source_ref: string | null
  /** First day of cycle 1. All swing windows are projected forward from this date. */
  anchor_date: string | null
  /** JSON array of {days, period} segments defining one complete roster cycle. */
  roster_cycle_json: Array<{ days: number; period: 'on' | 'off' }> | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceWorkerAvailabilityException {
  id: string
  business_id: string
  surveillance_worker_id: string
  exception_type: 'leave' | 'training' | 'restricted_duties' | 'off_site' | 'other'
  starts_at: string
  ends_at: string
  notes_operational: string | null
  created_by: string | null
  created_at: string
}

export interface SurveillanceReviewTask {
  id: string
  business_id: string
  surveillance_worker_id: string
  enrolment_id: string | null
  task_type: 'new_starter_baseline' | 'role_change_review' | 'site_transfer_review' | 'self_declared_review' | 'bulk_enrolment_review'
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  assigned_to: string | null
  due_at: string | null
  notes_operational: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceWorker {
  id: string
  business_id: string
  app_user_id: string | null
  worker_source: SurveillanceWorkerSource
  display_name: string
  phone: string | null
  email: string | null
  selected_worker_role_id: string | null
  job_role_name: string
  site_id: string | null
  site_name: string | null
  employee_number?: string | null
  employment_type?: string | null
  employing_entity?: string | null
  contractor_company_name?: string | null
  engagement_status?: string | null
  mobilisation_date?: string | null
  demobilisation_date?: string | null
  department?: string | null
  business_unit?: string | null
  workgroup_name?: string | null
  operational_area?: string | null
  jurisdiction_code?: string | null
  requires_health_surveillance: boolean
  notes_operational: string | null
  is_active: boolean
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceProgram {
  id: string
  business_id: string
  code: SurveillanceProgramCode
  name: string
  description: string | null
  is_active: boolean
  interval_days: number
  created_at: string
  updated_at: string
}

export interface SurveillanceEnrolment {
  id: string
  business_id: string
  surveillance_worker_id: string
  worker_user_id: string | null
  worker_display_name: string
  program_id: string
  surveillance_type_id?: string | null
  assignment_source?: string | null
  baseline_required?: boolean
  baseline_completed_at?: string | null
  frequency_override_days?: number | null
  review_required?: boolean
  review_reason_code_id?: string | null
  deactivated_at?: string | null
  deactivated_reason_code_id?: string | null
  status: SurveillanceEnrolmentStatus
  enrolled_at: string
  next_due_at: string | null
  next_appointment_at: string | null
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceAppointment {
  id: string
  business_id: string
  enrolment_id: string
  surveillance_worker_id: string
  worker_user_id: string | null
  worker_display_name: string
  program_id: string
  surveillance_type_id?: string | null
  assigned_staff_user_id: string | null
  assigned_staff_name: string | null
  site_id: string | null
  provider_id?: string | null
  provider_location_id?: string | null
  status_reason_code_id?: string | null
  confirmed_by_worker_at?: string | null
  provider_acknowledged_at?: string | null
  appointment_window_start?: string | null
  appointment_window_end?: string | null
  rescheduled_from_appointment_id?: string | null
  scheduled_at: string
  location: string | null
  appointment_type: string
  status: SurveillanceAppointmentStatus
  pre_appointment_instructions: string | null
  cancelled_reason: string | null
  completed_at: string | null
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface SurveillanceOutcomeMinimal {
  id: string
  business_id: string
  appointment_id: string
  surveillance_worker_id: string
  worker_user_id: string | null
  worker_display_name: string
  recorded_by: string
  recorded_by_name: string | null
  outcome_status: SurveillanceOutcomeStatus
  restriction_flag: boolean
  next_due_at: string | null
  outcome_received_at?: string | null
  outcome_communicated_at?: string | null
  corrective_action_required?: boolean
  corrective_action_ref?: string | null
  operational_notes: string | null
  external_record_ref?: string | null
  created_at: string
}

export interface SurveillanceDashboardMetrics {
  upcoming_count: number
  due_soon_count: number
  overdue_count: number
  completed_today_count: number
  completed_week_count: number
  active_enrolment_count: number
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
  export_confirmed_at?: string | null
  export_confirmed_by?: string | null
  export_confirmed_by_name?: string | null
  phi_purged_at?: string | null
  is_test?: boolean | null
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
  workerMobileSnapshot?: string | null
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

export interface PsychosocialReviewEntry {
  id: string
  createdAt: string
  createdByUserId: string
  createdByName: string
  actionLabel?: string | null
  note?: string | null
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
  reviewEntries?: PsychosocialReviewEntry[] | null
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
  export_confirmed_at?: string | null
  export_confirmed_by?: string | null
  export_confirmed_by_name?: string | null
  phi_purged_at?: string | null
  is_test?: boolean | null
}
