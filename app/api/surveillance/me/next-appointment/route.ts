import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { NO_STORE_HEADERS } from '@/lib/api-security'
import { requireAuthenticatedUser } from '@/lib/route-access'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const authError = requireAuthenticatedUser(user?.id)
  if (authError) {
    return NextResponse.json({ error: authError.error }, { status: authError.status, headers: NO_STORE_HEADERS })
  }

  const { data, error } = await supabase.rpc('get_my_next_surveillance_appointment')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const appointment = Array.isArray(data) ? (data[0] ?? null) : data

  return NextResponse.json(
    {
      appointment: appointment
        ? {
            id: appointment.appointment_id,
            businessId: appointment.business_id,
            enrolmentId: appointment.enrolment_id,
            programId: appointment.program_id,
            programCode: appointment.program_code,
            programName: appointment.program_name,
            scheduledAt: appointment.scheduled_at,
            location: appointment.location,
            appointmentType: appointment.appointment_type,
            status: appointment.status,
            instructions: appointment.pre_appointment_instructions,
            nextDueAt: appointment.next_due_at,
          }
        : null,
    },
    { headers: NO_STORE_HEADERS },
  )
}
