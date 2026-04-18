'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseBusinessLocalDateTimeToIso } from '@/lib/date-format'

const scheduleAppointmentSchema = z.object({
  enrolmentId: z.string().uuid(),
  scheduledAt: z.string().min(1),
  location: z.string().max(240).optional(),
  appointmentType: z.string().max(64).optional(),
  instructions: z.string().max(1000).optional(),
  providerId: z.string().uuid().optional().or(z.literal('')),
  providerLocationId: z.string().uuid().optional().or(z.literal('')),
})

const enrolWorkerSchema = z.object({
  programId: z.string().uuid().optional(),
  surveillanceTypeId: z.string().uuid().optional(),
  surveillanceWorkerId: z.string().uuid().optional(),
  workerUserId: z.string().uuid().optional(),
  baselineRequired: z.string().optional(),
  nextDueAt: z.string().optional(),
}).refine((value) => Boolean(value.surveillanceWorkerId || value.workerUserId), {
  message: 'A surveillance worker reference is required',
}).refine((value) => Boolean(value.programId || value.surveillanceTypeId), {
  message: 'A surveillance program or type is required',
})

const createManualWorkerSchema = z.object({
  displayName: z.string().min(1).max(160),
  phone: z.string().max(64).optional(),
  email: z.string().email().max(320).optional().or(z.literal('')),
  jobRoleName: z.string().min(1).max(160),
  selectedWorkerRoleId: z.string().uuid().optional().or(z.literal('')),
  siteId: z.string().optional(),
  requiresHealthSurveillance: z.string().optional(),
  notesOperational: z.string().max(500).optional(),
})

const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  scheduledAt: z.string().min(1),
  location: z.string().max(240).optional(),
  statusReasonCodeId: z.string().uuid().optional().or(z.literal('')),
  providerId: z.string().uuid().optional().or(z.literal('')),
  providerLocationId: z.string().uuid().optional().or(z.literal('')),
})

const cancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  reason: z.string().max(240).optional(),
  statusReasonCodeId: z.string().uuid().optional().or(z.literal('')),
})

const attendanceSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(['confirmed', 'did_not_attend']),
  statusReasonCodeId: z.string().uuid().optional().or(z.literal('')),
})

const completeAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  outcomeStatus: z.enum([
    'completed',
    'followup_required',
    'external_review_required',
    'temporary_restriction',
    'cleared',
  ]),
  restrictionFlag: z.string().optional(),
  nextDueAt: z.string().optional(),
  operationalNotes: z.string().max(500).optional(),
})

const createProviderSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().min(1).max(160),
  providerType: z.string().max(64).optional(),
  contactEmail: z.string().email().max(320).optional().or(z.literal('')),
  contactPhone: z.string().max(64).optional(),
})

const setProviderActiveSchema = z.object({
  providerId: z.string().uuid(),
  isActive: z.string(),
})

const createProviderLocationSchema = z.object({
  providerId: z.string().uuid(),
  siteId: z.string().optional(),
  locationName: z.string().min(1).max(160),
  addressText: z.string().max(500).optional(),
  supportsRemote: z.string().optional(),
  capacityNotes: z.string().max(500).optional(),
})

const updateProviderLocationSchema = z.object({
  locationId: z.string().uuid(),
  siteId: z.string().optional(),
  locationName: z.string().min(1).max(160),
  addressText: z.string().max(500).optional(),
  supportsRemote: z.string().optional(),
  capacityNotes: z.string().max(500).optional(),
})

const setProviderLocationActiveSchema = z.object({
  locationId: z.string().uuid(),
  isActive: z.string(),
})

const upsertRosterSchema = z.object({
  surveillanceWorkerId: z.string().uuid(),
  rosterPattern: z.string().min(1).max(120),
  shiftType: z.string().max(64).optional(),
  currentSwingStart: z.string().optional(),
  currentSwingEnd: z.string().optional(),
  sourceSystem: z.string().max(64).optional(),
  sourceRef: z.string().max(120).optional(),
  anchorDate: z.string().optional(),
  rosterCycleJson: z.string().optional(),
})

const addAvailabilityExceptionSchema = z.object({
  surveillanceWorkerId: z.string().uuid(),
  exceptionType: z.enum(['leave', 'training', 'restricted_duties', 'off_site', 'other']),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  notesOperational: z.string().max(500).optional(),
})

const createReviewTaskSchema = z.object({
  surveillanceWorkerId: z.string().uuid(),
  taskType: z.enum([
    'new_starter_baseline',
    'role_change_review',
    'site_transfer_review',
    'self_declared_review',
    'bulk_enrolment_review',
  ]),
  dueAt: z.string().optional(),
  notesOperational: z.string().max(500).optional(),
  enrolmentId: z.string().uuid().optional().or(z.literal('')),
  assignedTo: z.string().uuid().optional().or(z.literal('')),
})

const updateReviewTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']),
  notesOperational: z.string().max(500).optional(),
  surveillanceWorkerId: z.string().uuid().optional(),
})

const bulkEnrollWorkersSchema = z.object({
  businessId: z.string().min(1),
  surveillanceTypeId: z.string().uuid(),
  siteId: z.string().optional(),
  selectedWorkerRoleId: z.string().uuid().optional().or(z.literal('')),
  baselineRequired: z.string().optional(),
  nextDueAt: z.string().optional(),
  redirectTo: z.string().optional(),
})

const generateNotificationsSchema = z.object({
  businessId: z.string().min(1),
})

const acknowledgeEscalationSchema = z.object({
  notificationId: z.string().uuid(),
})

const updateEscalationPolicySchema = z.object({
  businessId: z.string().min(1),
  dueSoonDays: z.coerce.number().int().min(1).max(180),
  occHealthOverdueDays: z.coerce.number().int().min(0).max(365),
  supervisorOverdueDays: z.coerce.number().int().min(0).max(365),
  managerOverdueDays: z.coerce.number().int().min(0).max(365),
  isActive: z.string().optional(),
})

function getString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function parseOptionalTimestamp(value: string) {
  return value ? parseBusinessLocalDateTimeToIso(value) : null
}

function parseOptionalDate(value: string) {
  return value || null
}

function isMissingFunctionError(message: string) {
  return message.includes('Could not find the function')
    || message.includes('function public.')
    || message.includes('does not exist')
}

function revalidateSurveillancePaths() {
  revalidatePath('/surveillance')
  revalidatePath('/surveillance/appointments')
  revalidatePath('/surveillance/programs')
  revalidatePath('/surveillance/escalations')
  revalidatePath('/surveillance/notifications')
}

export async function enrollWorkerInSurveillanceAction(formData: FormData) {
  const parsed = enrolWorkerSchema.parse({
    programId: getString(formData, 'programId') || undefined,
    surveillanceTypeId: getString(formData, 'surveillanceTypeId') || undefined,
    surveillanceWorkerId: getString(formData, 'surveillanceWorkerId') || undefined,
    workerUserId: getString(formData, 'workerUserId') || undefined,
    baselineRequired: getString(formData, 'baselineRequired') || undefined,
    nextDueAt: getString(formData, 'nextDueAt') || undefined,
  })

  const supabase = await createClient()
  const nextDueAt = parseOptionalTimestamp(parsed.nextDueAt ?? '')
  const baselineRequired = parsed.baselineRequired === 'true'

  const { error } = parsed.surveillanceTypeId
    ? parsed.surveillanceWorkerId
      ? await supabase.rpc('enroll_surveillance_worker_record_by_type', {
          p_surveillance_type_id: parsed.surveillanceTypeId,
          p_surveillance_worker_id: parsed.surveillanceWorkerId,
          p_next_due_at: nextDueAt,
          p_baseline_required: baselineRequired,
        })
      : await supabase.rpc('enroll_worker_in_surveillance_by_type', {
          p_surveillance_type_id: parsed.surveillanceTypeId,
          p_worker_user_id: parsed.workerUserId,
          p_next_due_at: nextDueAt,
          p_baseline_required: baselineRequired,
        })
    : parsed.surveillanceWorkerId
      ? await supabase.rpc('enroll_surveillance_worker_record', {
          p_program_id: parsed.programId,
          p_surveillance_worker_id: parsed.surveillanceWorkerId,
          p_next_due_at: nextDueAt,
        })
      : await supabase.rpc('enroll_worker_in_surveillance', {
          p_program_id: parsed.programId,
          p_worker_user_id: parsed.workerUserId,
          p_next_due_at: nextDueAt,
        })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath(`/surveillance/workers/${parsed.surveillanceWorkerId ?? parsed.workerUserId}`)
}

export async function createManualSurveillanceWorkerAction(formData: FormData) {
  const parsed = createManualWorkerSchema.parse({
    displayName: getString(formData, 'displayName'),
    phone: getString(formData, 'phone') || undefined,
    email: getString(formData, 'email') || undefined,
    jobRoleName: getString(formData, 'jobRoleName'),
    selectedWorkerRoleId: getString(formData, 'selectedWorkerRoleId') || undefined,
    siteId: getString(formData, 'siteId') || undefined,
    requiresHealthSurveillance: getString(formData, 'requiresHealthSurveillance') || undefined,
    notesOperational: getString(formData, 'notesOperational') || undefined,
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_manual_surveillance_worker', {
    p_display_name: parsed.displayName,
    p_phone: parsed.phone ?? null,
    p_email: parsed.email ?? null,
    p_job_role_name: parsed.jobRoleName,
    p_selected_worker_role_id: parsed.selectedWorkerRoleId || null,
    p_site_id: parsed.siteId ?? null,
    p_requires_health_surveillance: parsed.requiresHealthSurveillance !== 'false',
    p_notes_operational: parsed.notesOperational ?? null,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/workers')
}

export async function scheduleSurveillanceAppointmentAction(formData: FormData) {
  const parsed = scheduleAppointmentSchema.parse({
    enrolmentId: getString(formData, 'enrolmentId'),
    scheduledAt: getString(formData, 'scheduledAt'),
    location: getString(formData, 'location') || undefined,
    appointmentType: getString(formData, 'appointmentType') || undefined,
    instructions: getString(formData, 'instructions') || undefined,
    providerId: getString(formData, 'providerId') || undefined,
    providerLocationId: getString(formData, 'providerLocationId') || undefined,
  })

  const supabase = await createClient()
  const scheduledAtIso = parseBusinessLocalDateTimeToIso(parsed.scheduledAt)
  if (!scheduledAtIso) throw new Error('Invalid appointment time')

  let { error } = await supabase.rpc('schedule_surveillance_appointment_v2', {
    p_enrolment_id: parsed.enrolmentId,
    p_scheduled_at: scheduledAtIso,
    p_location: parsed.location ?? null,
    p_appointment_type: parsed.appointmentType ?? 'periodic',
    p_instructions: parsed.instructions ?? null,
    p_provider_id: parsed.providerId || null,
    p_provider_location_id: parsed.providerLocationId || null,
  })

  if (error && isMissingFunctionError(error.message)) {
    const fallback = await supabase.rpc('schedule_surveillance_appointment', {
      p_enrolment_id: parsed.enrolmentId,
      p_scheduled_at: scheduledAtIso,
      p_location: parsed.location ?? null,
      p_appointment_type: parsed.appointmentType ?? 'periodic',
      p_instructions: parsed.instructions ?? null,
    })
    error = fallback.error
  }

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
}

export async function rescheduleSurveillanceAppointmentAction(formData: FormData) {
  const parsed = rescheduleAppointmentSchema.parse({
    appointmentId: getString(formData, 'appointmentId'),
    scheduledAt: getString(formData, 'scheduledAt'),
    location: getString(formData, 'location') || undefined,
    statusReasonCodeId: getString(formData, 'statusReasonCodeId') || undefined,
    providerId: getString(formData, 'providerId') || undefined,
    providerLocationId: getString(formData, 'providerLocationId') || undefined,
  })

  const supabase = await createClient()
  const scheduledAtIso = parseBusinessLocalDateTimeToIso(parsed.scheduledAt)
  if (!scheduledAtIso) throw new Error('Invalid appointment time')

  let { error } = await supabase.rpc('reschedule_surveillance_appointment_v2', {
    p_appointment_id: parsed.appointmentId,
    p_scheduled_at: scheduledAtIso,
    p_location: parsed.location ?? null,
    p_status_reason_code_id: parsed.statusReasonCodeId || null,
    p_provider_id: parsed.providerId || null,
    p_provider_location_id: parsed.providerLocationId || null,
  })

  if (error && isMissingFunctionError(error.message)) {
    const fallback = await supabase.rpc('reschedule_surveillance_appointment', {
      p_appointment_id: parsed.appointmentId,
      p_scheduled_at: scheduledAtIso,
      p_location: parsed.location ?? null,
    })
    error = fallback.error
  }

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath(`/surveillance/appointments/${parsed.appointmentId}`)
}

export async function markSurveillanceAttendanceAction(formData: FormData) {
  const parsed = attendanceSchema.parse({
    appointmentId: getString(formData, 'appointmentId'),
    status: getString(formData, 'status'),
    statusReasonCodeId: getString(formData, 'statusReasonCodeId') || undefined,
  })

  const supabase = await createClient()
  let { error } = await supabase.rpc('mark_surveillance_attendance_v2', {
    p_appointment_id: parsed.appointmentId,
    p_status: parsed.status,
    p_status_reason_code_id: parsed.statusReasonCodeId || null,
  })

  if (error && isMissingFunctionError(error.message)) {
    const fallback = await supabase.rpc('mark_surveillance_attendance', {
      p_appointment_id: parsed.appointmentId,
      p_status: parsed.status,
    })
    error = fallback.error
  }

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath(`/surveillance/appointments/${parsed.appointmentId}`)
}

export async function completeSurveillanceAppointmentAction(formData: FormData) {
  const parsed = completeAppointmentSchema.parse({
    appointmentId: getString(formData, 'appointmentId'),
    outcomeStatus: getString(formData, 'outcomeStatus'),
    restrictionFlag: getString(formData, 'restrictionFlag') || undefined,
    nextDueAt: getString(formData, 'nextDueAt') || undefined,
    operationalNotes: getString(formData, 'operationalNotes') || undefined,
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('complete_surveillance_appointment', {
    p_appointment_id: parsed.appointmentId,
    p_outcome_status: parsed.outcomeStatus,
    p_restriction_flag: parsed.restrictionFlag === 'true',
    p_next_due_at: parseOptionalTimestamp(parsed.nextDueAt ?? ''),
    p_operational_notes: parsed.operationalNotes ?? null,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath(`/surveillance/appointments/${parsed.appointmentId}`)
}

export async function cancelSurveillanceAppointmentAction(formData: FormData) {
  const parsed = cancelAppointmentSchema.parse({
    appointmentId: getString(formData, 'appointmentId'),
    reason: getString(formData, 'reason') || undefined,
    statusReasonCodeId: getString(formData, 'statusReasonCodeId') || undefined,
  })

  const supabase = await createClient()
  let { error } = await supabase.rpc('cancel_surveillance_appointment_v2', {
    p_appointment_id: parsed.appointmentId,
    p_reason: parsed.reason ?? null,
    p_status_reason_code_id: parsed.statusReasonCodeId || null,
  })

  if (error && isMissingFunctionError(error.message)) {
    const fallback = await supabase.rpc('cancel_surveillance_appointment', {
      p_appointment_id: parsed.appointmentId,
      p_reason: parsed.reason ?? null,
    })
    error = fallback.error
  }

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath(`/surveillance/appointments/${parsed.appointmentId}`)
}

export async function createSurveillanceProviderAction(formData: FormData) {
  const parsed = createProviderSchema.parse({
    businessId: getString(formData, 'businessId'),
    name: getString(formData, 'name'),
    providerType: getString(formData, 'providerType') || undefined,
    contactEmail: getString(formData, 'contactEmail') || undefined,
    contactPhone: getString(formData, 'contactPhone') || undefined,
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_surveillance_provider', {
    p_business_id: parsed.businessId,
    p_name: parsed.name,
    p_provider_type: parsed.providerType ?? null,
    p_contact_email: parsed.contactEmail || null,
    p_contact_phone: parsed.contactPhone ?? null,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/providers')
}

export async function setSurveillanceProviderActiveAction(formData: FormData) {
  const parsed = setProviderActiveSchema.parse({
    providerId: getString(formData, 'providerId'),
    isActive: getString(formData, 'isActive'),
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_surveillance_provider_active', {
    p_provider_id: parsed.providerId,
    p_is_active: parsed.isActive === 'true',
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/providers')
}

export async function createSurveillanceProviderLocationAction(formData: FormData) {
  const parsed = createProviderLocationSchema.parse({
    providerId: getString(formData, 'providerId'),
    siteId: getString(formData, 'siteId') || undefined,
    locationName: getString(formData, 'locationName'),
    addressText: getString(formData, 'addressText') || undefined,
    supportsRemote: getString(formData, 'supportsRemote') || undefined,
    capacityNotes: getString(formData, 'capacityNotes') || undefined,
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_surveillance_provider_location', {
    p_provider_id: parsed.providerId,
    p_site_id: parsed.siteId ?? null,
    p_location_name: parsed.locationName,
    p_address_text: parsed.addressText ?? null,
    p_supports_remote: parsed.supportsRemote === 'true',
    p_capacity_notes: parsed.capacityNotes ?? null,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/providers')
}

export async function updateSurveillanceProviderLocationAction(formData: FormData) {
  const parsed = updateProviderLocationSchema.parse({
    locationId: getString(formData, 'locationId'),
    siteId: getString(formData, 'siteId') || undefined,
    locationName: getString(formData, 'locationName'),
    addressText: getString(formData, 'addressText') || undefined,
    supportsRemote: getString(formData, 'supportsRemote') || undefined,
    capacityNotes: getString(formData, 'capacityNotes') || undefined,
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_surveillance_provider_location', {
    p_location_id: parsed.locationId,
    p_site_id: parsed.siteId ?? null,
    p_location_name: parsed.locationName,
    p_address_text: parsed.addressText ?? null,
    p_supports_remote: parsed.supportsRemote === 'true',
    p_capacity_notes: parsed.capacityNotes ?? null,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/providers')
}

export async function setSurveillanceProviderLocationActiveAction(formData: FormData) {
  const parsed = setProviderLocationActiveSchema.parse({
    locationId: getString(formData, 'locationId'),
    isActive: getString(formData, 'isActive'),
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_surveillance_provider_location_active', {
    p_location_id: parsed.locationId,
    p_is_active: parsed.isActive === 'true',
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/providers')
}

export async function upsertSurveillanceWorkerRosterAction(formData: FormData) {
  const parsed = upsertRosterSchema.parse({
    surveillanceWorkerId: getString(formData, 'surveillanceWorkerId'),
    rosterPattern: getString(formData, 'rosterPattern'),
    shiftType: getString(formData, 'shiftType') || undefined,
    currentSwingStart: getString(formData, 'currentSwingStart') || undefined,
    currentSwingEnd: getString(formData, 'currentSwingEnd') || undefined,
    sourceSystem: getString(formData, 'sourceSystem') || undefined,
    sourceRef: getString(formData, 'sourceRef') || undefined,
    anchorDate: getString(formData, 'anchorDate') || undefined,
    rosterCycleJson: getString(formData, 'rosterCycleJson') || undefined,
  })

  let parsedCycle: Array<{ days: number; period: 'on' | 'off' }> | null = null
  if (parsed.rosterCycleJson) {
    try {
      parsedCycle = JSON.parse(parsed.rosterCycleJson)
    } catch {
      parsedCycle = null
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('upsert_surveillance_worker_roster', {
    p_surveillance_worker_id: parsed.surveillanceWorkerId,
    p_roster_pattern: parsed.rosterPattern,
    p_shift_type: parsed.shiftType ?? null,
    p_current_swing_start: parseOptionalDate(parsed.currentSwingStart ?? ''),
    p_current_swing_end: parseOptionalDate(parsed.currentSwingEnd ?? ''),
    p_source_system: parsed.sourceSystem ?? null,
    p_source_ref: parsed.sourceRef ?? null,
    p_anchor_date: parseOptionalDate(parsed.anchorDate ?? ''),
    p_roster_cycle_json: parsedCycle,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath(`/surveillance/workers/${parsed.surveillanceWorkerId}`)
  revalidatePath('/surveillance/workers')
}

export async function addSurveillanceWorkerAvailabilityExceptionAction(formData: FormData) {
  const parsed = addAvailabilityExceptionSchema.parse({
    surveillanceWorkerId: getString(formData, 'surveillanceWorkerId'),
    exceptionType: getString(formData, 'exceptionType'),
    startsAt: getString(formData, 'startsAt'),
    endsAt: getString(formData, 'endsAt'),
    notesOperational: getString(formData, 'notesOperational') || undefined,
  })

  const startsAtIso = parseBusinessLocalDateTimeToIso(parsed.startsAt)
  const endsAtIso = parseBusinessLocalDateTimeToIso(parsed.endsAt)
  if (!startsAtIso || !endsAtIso) throw new Error('Invalid availability window')

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_surveillance_worker_availability_exception', {
    p_surveillance_worker_id: parsed.surveillanceWorkerId,
    p_exception_type: parsed.exceptionType,
    p_starts_at: startsAtIso,
    p_ends_at: endsAtIso,
    p_notes_operational: parsed.notesOperational ?? null,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath(`/surveillance/workers/${parsed.surveillanceWorkerId}`)
  revalidatePath('/surveillance/workers')
}

export async function createSurveillanceReviewTaskAction(formData: FormData) {
  const parsed = createReviewTaskSchema.parse({
    surveillanceWorkerId: getString(formData, 'surveillanceWorkerId'),
    taskType: getString(formData, 'taskType'),
    dueAt: getString(formData, 'dueAt') || undefined,
    notesOperational: getString(formData, 'notesOperational') || undefined,
    enrolmentId: getString(formData, 'enrolmentId') || undefined,
    assignedTo: getString(formData, 'assignedTo') || undefined,
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_surveillance_review_task', {
    p_surveillance_worker_id: parsed.surveillanceWorkerId,
    p_task_type: parsed.taskType,
    p_due_at: parseOptionalTimestamp(parsed.dueAt ?? ''),
    p_notes_operational: parsed.notesOperational ?? null,
    p_enrolment_id: parsed.enrolmentId || null,
    p_assigned_to: parsed.assignedTo || null,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath(`/surveillance/workers/${parsed.surveillanceWorkerId}`)
  revalidatePath('/surveillance/workers')
  revalidatePath('/surveillance/reports')
}

export async function updateSurveillanceReviewTaskStatusAction(formData: FormData) {
  const parsed = updateReviewTaskStatusSchema.parse({
    taskId: getString(formData, 'taskId'),
    status: getString(formData, 'status'),
    notesOperational: getString(formData, 'notesOperational') || undefined,
    surveillanceWorkerId: getString(formData, 'surveillanceWorkerId') || undefined,
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_surveillance_review_task_status', {
    p_task_id: parsed.taskId,
    p_status: parsed.status,
    p_notes_operational: parsed.notesOperational ?? null,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/reports')
  revalidatePath('/surveillance/workers')
  if (parsed.surveillanceWorkerId) {
    revalidatePath(`/surveillance/workers/${parsed.surveillanceWorkerId}`)
  }
}

export async function bulkEnrollSurveillanceWorkersAction(formData: FormData) {
  const parsed = bulkEnrollWorkersSchema.parse({
    businessId: getString(formData, 'businessId'),
    surveillanceTypeId: getString(formData, 'surveillanceTypeId'),
    siteId: getString(formData, 'siteId') || undefined,
    selectedWorkerRoleId: getString(formData, 'selectedWorkerRoleId') || undefined,
    baselineRequired: getString(formData, 'baselineRequired') || undefined,
    nextDueAt: getString(formData, 'nextDueAt') || undefined,
    redirectTo: getString(formData, 'redirectTo') || undefined,
  })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_enroll_surveillance_workers_by_type', {
    p_business_id: parsed.businessId,
    p_surveillance_type_id: parsed.surveillanceTypeId,
    p_site_id: parsed.siteId || null,
    p_selected_worker_role_id: parsed.selectedWorkerRoleId || null,
    p_baseline_required: parsed.baselineRequired === 'true',
    p_next_due_at: parseOptionalTimestamp(parsed.nextDueAt ?? ''),
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/workers')

  const redirectUrl = new URL(parsed.redirectTo || '/surveillance/workers', 'http://localhost')
  redirectUrl.searchParams.set('bulkResult', String(data ?? 0))
  redirectUrl.searchParams.set('bulkDueMode', parsed.nextDueAt ? 'custom' : 'unset')
  redirect(redirectUrl.pathname + (redirectUrl.search ? redirectUrl.search : ''))
}

export async function generateSurveillanceNotificationsAction(formData: FormData) {
  const parsed = generateNotificationsSchema.parse({
    businessId: getString(formData, 'businessId'),
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('generate_surveillance_notifications', {
    p_business_id: parsed.businessId,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/notifications')
  revalidatePath('/surveillance/reports')
}

export async function updateSurveillanceEscalationPolicyAction(formData: FormData) {
  const parsed = updateEscalationPolicySchema.parse({
    businessId: getString(formData, 'businessId'),
    dueSoonDays: getString(formData, 'dueSoonDays'),
    occHealthOverdueDays: getString(formData, 'occHealthOverdueDays'),
    supervisorOverdueDays: getString(formData, 'supervisorOverdueDays'),
    managerOverdueDays: getString(formData, 'managerOverdueDays'),
    isActive: getString(formData, 'isActive'),
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('upsert_surveillance_escalation_policy', {
    p_business_id: parsed.businessId,
    p_due_soon_days: parsed.dueSoonDays,
    p_occ_health_overdue_days: parsed.occHealthOverdueDays,
    p_supervisor_overdue_days: parsed.supervisorOverdueDays,
    p_manager_overdue_days: parsed.managerOverdueDays,
    p_is_active: parsed.isActive !== 'false',
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/notifications')
}

export async function acknowledgeSurveillanceEscalationAction(formData: FormData) {
  const parsed = acknowledgeEscalationSchema.parse({
    notificationId: getString(formData, 'notificationId'),
  })

  const supabase = await createClient()
  const { error } = await supabase.rpc('acknowledge_surveillance_notification', {
    p_notification_id: parsed.notificationId,
  })

  if (error) throw new Error(error.message)

  revalidateSurveillancePaths()
  revalidatePath('/surveillance/escalations')
  revalidatePath('/surveillance/notifications')
}
