import { redirect } from 'next/navigation'
import StatusBadge from '@/components/surveillance/StatusBadge'
import { formatDate, formatTimestamp } from '@/lib/date-format'
import {
  cancelSurveillanceAppointmentAction,
  completeSurveillanceAppointmentAction,
  markSurveillanceAttendanceAction,
  rescheduleSurveillanceAppointmentAction,
} from '@/lib/surveillance/actions'
import { getSurveillanceAppointmentDetail } from '@/lib/surveillance/queries'

export default async function SurveillanceAppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let data = null

  try {
    data = await getSurveillanceAppointmentDetail(id)
  } catch (error) {
    console.error('[surveillance/appointment-detail] failed to load appointment detail', { appointmentId: id, error })
  }

  if (!data) redirect('/surveillance/appointments')

  const { appointment, enrolment, outcome } = data
  const rescheduleReasonCodes = data.availableReasonCodes.filter((reasonCode) => reasonCode.category === 'rescheduled')
  const cancelReasonCodes = data.availableReasonCodes.filter((reasonCode) => reasonCode.category === 'cancelled')
  const dnaReasonCodes = data.availableReasonCodes.filter((reasonCode) => reasonCode.category === 'did_not_attend')

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Appointment</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--surv-text)]">{appointment.worker_display_name}</h1>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">
            {appointment.requirement?.name ?? appointment.program?.name ?? 'Requirement'} • {formatTimestamp(appointment.scheduled_at)}
          </p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <section className="surv-card">
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Appointment details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-[var(--surv-muted)]">Location</dt>
              <dd className="text-[var(--surv-text)]">{appointment.location ?? 'TBC'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Type</dt>
              <dd className="text-[var(--surv-text)]">{appointment.appointment_type}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Assigned staff</dt>
              <dd className="text-[var(--surv-text)]">{appointment.assigned_staff_name ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Provider</dt>
              <dd className="text-[var(--surv-text)]">
                {data.availableProviders.find((provider) => provider.id === appointment.provider_id)?.name ?? 'Not assigned'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Clinic location</dt>
              <dd className="text-[var(--surv-text)]">
                {data.availableProviderLocations.find((location) => location.id === appointment.provider_location_id)?.location_name ?? 'Not assigned'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Status reason</dt>
              <dd className="text-[var(--surv-text)]">
                {data.availableReasonCodes.find((reasonCode) => reasonCode.id === appointment.status_reason_code_id)?.label ?? 'None recorded'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Instructions</dt>
              <dd className="text-[var(--surv-text)]">{appointment.pre_appointment_instructions ?? 'None recorded'}</dd>
            </div>
            {enrolment?.next_due_at ? (
              <div>
                <dt className="text-[var(--surv-muted)]">Enrolment next due</dt>
                <dd className="text-[var(--surv-text)]">{formatDate(enrolment.next_due_at)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="space-y-4">
          <form action={rescheduleSurveillanceAppointmentAction} className="surv-card">
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <h2 className="text-lg font-semibold text-[var(--surv-text)]">Reschedule</h2>
            <div className="mt-4 grid gap-3">
              <input name="scheduledAt" type="datetime-local" required className="surv-input" />
              <input name="location" type="text" placeholder="Updated location" className="surv-input" />
              {data.availableProviders.length > 0 ? (
                <>
                  <select
                    name="providerId"
                    defaultValue={appointment.provider_id ?? ''}
                    className="surv-input"
                  >
                    <option value="">No provider selected</option>
                    {data.availableProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name}</option>
                    ))}
                  </select>
                  {data.availableProviderLocations.length > 0 ? (
                    <select
                      name="providerLocationId"
                      defaultValue={appointment.provider_location_id ?? ''}
                      className="surv-input"
                    >
                      <option value="">No clinic location selected</option>
                      {data.availableProviderLocations.map((location) => {
                        const providerName = data.availableProviders.find((provider) => provider.id === location.provider_id)?.name ?? 'Provider'
                        return (
                          <option key={location.id} value={location.id}>
                            {providerName} • {location.location_name}
                          </option>
                        )
                      })}
                    </select>
                  ) : null}
                </>
              ) : null}
              {rescheduleReasonCodes.length > 0 ? (
                <select
                  name="statusReasonCodeId"
                  defaultValue={appointment.status_reason_code_id ?? ''}
                  className="surv-input"
                >
                  <option value="">No reschedule reason</option>
                  {rescheduleReasonCodes.map((reasonCode) => (
                    <option key={reasonCode.id} value={reasonCode.id}>{reasonCode.label}</option>
                  ))}
                </select>
              ) : null}
              <button type="submit" className="surv-btn-primary">
                Save reschedule
              </button>
            </div>
          </form>

          <form action={markSurveillanceAttendanceAction} className="surv-card">
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <h2 className="text-lg font-semibold text-[var(--surv-text)]">Attendance</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                name="status"
                value="confirmed"
                className="surv-btn-primary"
              >
                Mark confirmed
              </button>
            </div>
            {dnaReasonCodes.length > 0 ? (
              <select name="statusReasonCodeId" defaultValue="" className="surv-input mt-3">
                <option value="">No DNA reason</option>
                {dnaReasonCodes.map((reasonCode) => (
                  <option key={reasonCode.id} value={reasonCode.id}>{reasonCode.label}</option>
                ))}
              </select>
            ) : null}
            <div className="mt-3">
              <button
                type="submit"
                name="status"
                value="did_not_attend"
                className="surv-btn-danger"
              >
                Mark DNA
              </button>
            </div>
          </form>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <form action={completeSurveillanceAppointmentAction} className="surv-card">
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Complete appointment</h2>
          <div className="mt-4 grid gap-3">
            <select
              name="outcomeStatus"
              defaultValue="completed"
              className="surv-input"
            >
              <option value="completed">Completed</option>
              <option value="followup_required">Follow-up required</option>
              <option value="external_review_required">External review required</option>
              <option value="temporary_restriction">Temporary restriction</option>
              <option value="cleared">Cleared</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-[var(--surv-text)]">
              <input type="checkbox" name="restrictionFlag" value="true" />
              Restriction flag only
            </label>
            <input
              name="nextDueAt"
              type="datetime-local"
              className="surv-input"
            />
            <textarea
              name="operationalNotes"
              rows={3}
              placeholder="Operational notes only. No clinical findings."
              className="surv-input"
            />
            <button type="submit" className="surv-btn-success">
              Complete appointment
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <form action={cancelSurveillanceAppointmentAction} className="surv-card">
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <h2 className="text-lg font-semibold text-[var(--surv-text)]">Cancel appointment</h2>
            <div className="mt-4 grid gap-3">
              <input name="reason" type="text" placeholder="Operational reason" className="surv-input" />
              {cancelReasonCodes.length > 0 ? (
                <select
                  name="statusReasonCodeId"
                  defaultValue={appointment.status_reason_code_id ?? ''}
                  className="surv-input"
                >
                  <option value="">No cancellation reason code</option>
                  {cancelReasonCodes.map((reasonCode) => (
                    <option key={reasonCode.id} value={reasonCode.id}>{reasonCode.label}</option>
                  ))}
                </select>
              ) : null}
              <button type="submit" className="surv-btn-secondary">
                Cancel appointment
              </button>
            </div>
          </form>

          <div className="surv-card">
            <h2 className="text-lg font-semibold text-[var(--surv-text)]">Recorded outcome</h2>
            {outcome ? (
              <div className="mt-4 space-y-2 text-sm">
                <StatusBadge status={outcome.outcome_status} />
                <p className="text-[var(--surv-text)]">Restriction flag: {outcome.restriction_flag ? 'Yes' : 'No'}</p>
                {outcome.next_due_at ? (
                  <p className="text-[var(--surv-text)]">Next due: {formatDate(outcome.next_due_at)}</p>
                ) : null}
                {outcome.operational_notes ? (
                  <p className="text-[var(--surv-muted)]">{outcome.operational_notes}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--surv-muted)]">No outcome recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
