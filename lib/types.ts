export type UserRole = 'worker' | 'medic' | 'admin' | 'pending_medic' | 'superuser'

export type SubmissionStatus = 'New' | 'In Review' | 'Approved' | 'Requires Follow-up'

export interface UserAccount {
  id: string
  business_id: string
  display_name: string
  email: string
  role: UserRole
  site_ids: string[]
  contract_end_date: string | null
}

export interface Business {
  id: string
  name: string
  contact_email: string
  is_suspended?: boolean
}

export interface Site {
  id: string
  business_id: string
  name: string
  latitude: number | null
  longitude: number | null
  is_office: boolean
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
  phi_purged_at: string | null
  comments: MedicComment[]
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
