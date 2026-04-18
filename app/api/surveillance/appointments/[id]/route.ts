import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { requireAuthenticatedUser } from '@/lib/route-access'
import { requireSameOrigin } from '@/lib/api-security'
import { parseBusinessLocalDateTimeToIso } from '@/lib/date-format'

const appointmentMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reschedule'),
    scheduledAt: z.string().min(1),
    location: z.string().max(240).optional(),
    statusReasonCodeId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    providerLocationId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal('attendance'),
    status: z.enum(['confirmed', 'did_not_attend']),
    statusReasonCodeId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal('complete'),
    outcomeStatus: z.enum([
      'completed',
      'followup_required',
      'external_review_required',
      'temporary_restriction',
      'cleared',
    ]),
    restrictionFlag: z.boolean().optional(),
    nextDueAt: z.string().optional(),
    operationalNotes: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('cancel'),
    reason: z.string().max(240).optional(),
    statusReasonCodeId: z.string().uuid().optional(),
  }),
])

function isMissingFunctionError(message: string) {
  return message.includes('Could not find the function')
    || message.includes('function public.')
    || message.includes('does not exist')
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params
  const parsedAppointmentId = parseUuidParam(resolvedParams.id, 'Appointment id')
  if (!parsedAppointmentId.success) return parsedAppointmentId.response

  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const authError = requireAuthenticatedUser(user?.id)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const parsed = await parseJsonBody(req, appointmentMutationSchema)
  if (!parsed.success) return parsed.response

  const body = parsed.data

  if (body.action === 'reschedule') {
    const scheduledAtIso = parseBusinessLocalDateTimeToIso(body.scheduledAt)
    if (!scheduledAtIso) {
      return NextResponse.json({ error: 'Invalid appointment time' }, { status: 400 })
    }

    let { error } = await supabase.rpc('reschedule_surveillance_appointment_v2', {
      p_appointment_id: parsedAppointmentId.value,
      p_scheduled_at: scheduledAtIso,
      p_location: body.location ?? null,
      p_status_reason_code_id: body.statusReasonCodeId ?? null,
      p_provider_id: body.providerId ?? null,
      p_provider_location_id: body.providerLocationId ?? null,
    })

    if (error && isMissingFunctionError(error.message)) {
      const fallback = await supabase.rpc('reschedule_surveillance_appointment', {
        p_appointment_id: parsedAppointmentId.value,
        p_scheduled_at: scheduledAtIso,
        p_location: body.location ?? null,
      })
      error = fallback.error
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'attendance') {
    let { error } = await supabase.rpc('mark_surveillance_attendance_v2', {
      p_appointment_id: parsedAppointmentId.value,
      p_status: body.status,
      p_status_reason_code_id: body.statusReasonCodeId ?? null,
    })

    if (error && isMissingFunctionError(error.message)) {
      const fallback = await supabase.rpc('mark_surveillance_attendance', {
        p_appointment_id: parsedAppointmentId.value,
        p_status: body.status,
      })
      error = fallback.error
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'complete') {
    const nextDueAtIso = body.nextDueAt ? parseBusinessLocalDateTimeToIso(body.nextDueAt) : null
    if (body.nextDueAt && !nextDueAtIso) {
      return NextResponse.json({ error: 'Invalid next due time' }, { status: 400 })
    }

    const { error } = await supabase.rpc('complete_surveillance_appointment', {
      p_appointment_id: parsedAppointmentId.value,
      p_outcome_status: body.outcomeStatus,
      p_restriction_flag: body.restrictionFlag ?? false,
      p_next_due_at: nextDueAtIso,
      p_operational_notes: body.operationalNotes ?? null,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  let { error } = await supabase.rpc('cancel_surveillance_appointment_v2', {
    p_appointment_id: parsedAppointmentId.value,
    p_reason: body.reason ?? null,
    p_status_reason_code_id: body.statusReasonCodeId ?? null,
  })

  if (error && isMissingFunctionError(error.message)) {
    const fallback = await supabase.rpc('cancel_surveillance_appointment', {
      p_appointment_id: parsedAppointmentId.value,
      p_reason: body.reason ?? null,
    })
    error = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
