import { redirect } from 'next/navigation'
import StatusBadge from '@/components/surveillance/StatusBadge'
import ScheduleAppointmentForm from '@/components/surveillance/ScheduleAppointmentForm'
import RosterForm from '@/components/surveillance/RosterForm'
import { formatDate, formatTimestamp } from '@/lib/date-format'
import {
  addSurveillanceWorkerAvailabilityExceptionAction,
  createSurveillanceReviewTaskAction,
  enrollWorkerInSurveillanceAction,
  updateSurveillanceReviewTaskStatusAction,
} from '@/lib/surveillance/actions'
import { getSurveillanceWorkerDetail } from '@/lib/surveillance/queries'

function complianceBadgeClass(status: 'green' | 'amber' | 'red' | 'grey') {
  switch (status) {
    case 'green':
      return 'bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]'
    case 'amber':
      return 'bg-[color:var(--surv-accent-soft)] text-[color:var(--surv-accent)]'
    case 'red':
      return 'bg-[color:var(--surv-red-soft)] text-[color:var(--surv-red-text)]'
    case 'grey':
    default:
      return 'bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]'
  }
}

function complianceReasonLabel(reason: 'no_active_assignments' | 'baseline_incomplete' | 'overdue' | 'due_soon' | 'current') {
  switch (reason) {
    case 'no_active_assignments':
      return 'No active surveillance assignments'
    case 'baseline_incomplete':
      return 'Baseline surveillance still required'
    case 'overdue':
      return 'At least one active requirement is overdue'
    case 'due_soon':
      return 'At least one active requirement is due within 30 days'
    case 'current':
    default:
      return 'All active requirements are currently in date'
  }
}

const REVIEW_TASK_LABELS: Record<string, string> = {
  new_starter_baseline: 'New starter baseline',
  role_change_review: 'Role change review',
  site_transfer_review: 'Site transfer review',
  self_declared_review: 'Self-declared surveillance review',
  bulk_enrolment_review: 'Bulk enrolment review',
}

const REVIEW_TASK_DESCRIPTIONS: Record<string, string> = {
  new_starter_baseline: 'Confirm baseline surveillance is scheduled for a new or recently mobilised worker.',
  role_change_review: 'Reassess surveillance requirements after a worker changes role or exposure profile.',
  site_transfer_review: 'Review surveillance status following a worker transfer to a different site.',
  self_declared_review: 'Assess a worker who has self-declared that their role may require health surveillance.',
  bulk_enrolment_review: 'Review the outcome of a bulk enrolment action for this worker.',
}

const EXCEPTION_DESCRIPTIONS: Record<string, string> = {
  leave: 'Annual, personal, or medical leave — worker will not be available for appointments.',
  training: 'Dedicated training period off-site or otherwise unavailable for scheduling.',
  restricted_duties: 'Worker is on light or restricted duties and may need scheduling consideration.',
  off_site: 'Temporarily working away from their normal site without following the standard roster pattern.',
  other: 'Any other period of known unavailability not covered above.',
}

export default async function SurveillanceWorkerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let data = null

  try {
    data = await getSurveillanceWorkerDetail(id)
  } catch (error) {
    console.error('[surveillance/worker-detail] failed to load worker detail', { workerId: id, error })
  }

  if (!data) redirect('/surveillance')

  return (
    <div className="surv-page">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="surv-header-band">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--surv-text)]">{data.workerDisplayName}</h1>
          {data.worker ? (
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium uppercase ${complianceBadgeClass(data.worker.complianceStatus)}`}>
              {data.worker.complianceStatus}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--surv-muted)]">
          Surveillance-only worker view. This page intentionally excludes clinical findings and detailed health notes.
        </p>
        {data.worker ? (
          <p className="mt-2 text-sm text-[var(--surv-text)]">{complianceReasonLabel(data.worker.complianceReason)}</p>
        ) : null}
      </div>

      {/* ── Worker surveillance setup summary ───────────────────────── */}
      {data.worker ? (
        <section className="surv-card">
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Worker surveillance setup</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">
            Operational profile recorded from the worker&apos;s app setup or manual entry. No clinical detail is stored here.
          </p>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-[var(--surv-muted)]">Job role</dt>
              <dd className="text-[var(--surv-text)]">{data.worker.selectedRole?.name ?? data.worker.job_role_name}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Worker source</dt>
              <dd className="capitalize text-[var(--surv-text)]">{data.worker.worker_source === 'manual_entry' ? 'Manual entry' : 'App worker'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Health surveillance required</dt>
              <dd className="text-[var(--surv-text)]">{data.worker.requires_health_surveillance ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Compliance reason</dt>
              <dd className="text-[var(--surv-text)]">{complianceReasonLabel(data.worker.complianceReason)}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Added to dashboard</dt>
              <dd className="text-[var(--surv-text)]">{formatTimestamp(data.worker.created_at)}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Phone</dt>
              <dd className="text-[var(--surv-text)]">{data.worker.phone ?? 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Email</dt>
              <dd className="text-[var(--surv-text)]">{data.worker.email ?? 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Site</dt>
              <dd className="text-[var(--surv-text)]">{data.worker.site_name ?? 'Not assigned'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Notes</dt>
              <dd className="text-[var(--surv-text)]">{data.worker.notes_operational ?? 'None recorded'}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <section className="surv-empty">
          This worker has not completed the operational role setup needed for surveillance intake yet.
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="space-y-4">

          {/* ── Roster (smart swing calculator) ─────────────────────── */}
          <RosterForm
            surveillanceWorkerId={data.workerId}
            existingRoster={data.roster ? {
              pattern: data.roster.roster_pattern,
              shiftType: data.roster.shift_type,
              anchorDate: data.roster.anchor_date,
              cycleJson: data.roster.roster_cycle_json,
              sourceSystem: data.roster.source_system,
              sourceRef: data.roster.source_ref,
            } : null}
          />

          {/* ── Availability exceptions ──────────────────────────────── */}
          <div className="surv-card">
            <div>
              <h2 className="text-lg font-semibold text-[var(--surv-text)]">Availability exceptions</h2>
              <p className="mt-1 text-sm text-[var(--surv-muted)]">
                Record one-off periods when this worker cannot attend appointments — such as leave, training,
                restricted duties, or time away from site. These are separate from their regular roster pattern
                and are used to flag scheduling conflicts.
              </p>
            </div>

            {data.availabilityExceptions.length > 0 ? (
              <div className="mt-4 space-y-3">
                {data.availabilityExceptions.map((exception) => (
                  <div key={exception.id} className="surv-card-soft">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium capitalize text-[var(--text-1)]">
                          {exception.exception_type.replaceAll('_', ' ')}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--surv-muted)]">
                          {EXCEPTION_DESCRIPTIONS[exception.exception_type]}
                        </p>
                      </div>
                      <p className="text-xs text-[var(--surv-muted)]">
                        {formatTimestamp(exception.starts_at)} → {formatTimestamp(exception.ends_at)}
                      </p>
                    </div>
                    {exception.notes_operational ? (
                      <p className="mt-2 text-sm text-[var(--surv-muted)]">{exception.notes_operational}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--surv-muted)]">No availability exceptions recorded yet.</p>
            )}

            <form action={addSurveillanceWorkerAvailabilityExceptionAction} className="mt-5 grid gap-3 border-t border-[var(--surv-border)] pt-5 md:grid-cols-2">
              <input type="hidden" name="surveillanceWorkerId" value={data.workerId} />

              <div className="md:col-span-2">
                <label htmlFor="exceptionType" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                  Exception type <span className="text-[var(--surv-red-text)]">*</span>
                </label>
                <select id="exceptionType" name="exceptionType" required className="surv-input">
                  <option value="leave">Leave — annual, personal, or medical</option>
                  <option value="training">Training — dedicated training period</option>
                  <option value="restricted_duties">Restricted duties — light or modified duties</option>
                  <option value="off_site">Off site — away from normal site outside roster pattern</option>
                  <option value="other">Other — any other known unavailability</option>
                </select>
              </div>

              <div>
                <label htmlFor="startsAt" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                  Starts <span className="text-[var(--surv-red-text)]">*</span>
                </label>
                <input id="startsAt" name="startsAt" type="datetime-local" required className="surv-input" />
              </div>
              <div>
                <label htmlFor="endsAt" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                  Ends <span className="text-[var(--surv-red-text)]">*</span>
                </label>
                <input id="endsAt" name="endsAt" type="datetime-local" required className="surv-input" />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="notesOperationalException" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                  Internal note <span className="text-xs font-normal text-[var(--surv-muted)]">(optional — not visible to worker)</span>
                </label>
                <input id="notesOperationalException" name="notesOperational" placeholder="e.g. pending HR approval, covers FIFO changeover" className="surv-input" />
              </div>

              <div className="md:col-span-2">
                <button type="submit" className="surv-btn-secondary">
                  Add availability exception
                </button>
              </div>
            </form>
          </div>

          {/* ── Enrolments ───────────────────────────────────────────── */}
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Surveillance enrolments</h2>
          <p className="text-sm text-[var(--surv-muted)]">
            Active surveillance requirements for this worker. Each enrolment tracks a specific surveillance
            type, its due date, and allows appointments to be scheduled.
          </p>
          {data.enrolments.length === 0 ? (
            <div className="surv-empty">
              No surveillance enrolments were found for this worker.
            </div>
          ) : (
            data.enrolments.map((enrolment) => (
              <div key={enrolment.id} className="surv-card space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--surv-text)]">
                      {enrolment.requirement?.name ?? enrolment.program?.name ?? 'Requirement'}
                    </p>
                    <p className="mt-1 text-sm text-[var(--surv-muted)]">
                      Enrolled {formatDate(enrolment.enrolled_at)}
                      {enrolment.next_due_at ? ` • next due ${formatDate(enrolment.next_due_at)}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={enrolment.status} />
                </div>

                <ScheduleAppointmentForm
                  enrolmentId={enrolment.id}
                  availableProviders={data.availableProviders.map((provider) => ({
                    id: provider.id,
                    name: provider.name,
                  }))}
                  availableProviderLocations={data.availableProviderLocations.map((location) => {
                    const providerName = data.availableProviders.find((provider) => provider.id === location.provider_id)?.name ?? 'Provider'
                    return {
                      id: location.id,
                      providerId: location.provider_id,
                      label: `${providerName} • ${location.location_name}`,
                    }
                  })}
                />
              </div>
            ))
          )}
        </section>

        {/* ── Right column ─────────────────────────────────────────── */}
        <section className="space-y-4">

          {/* First enrolment form (only shown when no enrolments exist yet) */}
          {data.enrolments.length === 0 ? (
            <form action={enrollWorkerInSurveillanceAction} className="surv-card">
              <input type="hidden" name="surveillanceWorkerId" value={data.workerId} />
              <h2 className="text-lg font-semibold text-[var(--surv-text)]">Create first enrolment</h2>
              <p className="mt-1 text-sm text-[var(--surv-muted)]">
                Enrol this worker in their first surveillance requirement to begin tracking compliance.
              </p>
              <div className="mt-4 grid gap-3">
                {data.availableSurveillanceTypes.length > 0 ? (
                  <>
                    <div>
                      <label htmlFor="surveillanceTypeId" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                        Surveillance type <span className="text-[var(--surv-red-text)]">*</span>
                      </label>
                      <select name="surveillanceTypeId" id="surveillanceTypeId" required className="surv-input">
                        <option value="">Select a surveillance type</option>
                        {data.availableSurveillanceTypes.map((surveillanceType) => (
                          <option key={surveillanceType.id} value={surveillanceType.id}>
                            {surveillanceType.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[var(--surv-text)]">
                      <input
                        name="baselineRequired"
                        type="checkbox"
                        value="true"
                        className="h-4 w-4 rounded border border-[var(--border)]"
                      />
                      Baseline required before compliant status
                    </label>
                    <p className="text-xs text-[var(--surv-muted)]">
                      Tick this if the worker needs an initial baseline assessment before their status can show as current (green).
                    </p>
                  </>
                ) : (
                  <div>
                    <label htmlFor="programId" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                      Surveillance program <span className="text-[var(--surv-red-text)]">*</span>
                    </label>
                    <select name="programId" id="programId" required className="surv-input">
                      <option value="">Select a program</option>
                      {data.availablePrograms.map((program) => (
                        <option key={program.id} value={program.id}>{program.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="nextDueAt" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                    Next due date <span className="text-xs font-normal text-[var(--surv-muted)]">(optional — leave blank to set when scheduling)</span>
                  </label>
                  <input name="nextDueAt" id="nextDueAt" type="datetime-local" className="surv-input" />
                </div>
                <button type="submit" className="surv-btn-primary">
                  Enrol worker
                </button>
              </div>
            </form>
          ) : null}

          {/* ── Recent outcomes ──────────────────────────────────────── */}
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Recent outcomes</h2>
          <p className="text-sm text-[var(--surv-muted)]">
            Administrative outcome status only. No clinical measurements, diagnoses, or provider notes are stored.
          </p>
          {data.outcomes.length === 0 ? (
            <div className="surv-empty">
              No minimal outcomes recorded yet.
            </div>
          ) : (
            data.outcomes.map((outcome) => (
              <div key={outcome.id} className="surv-card-soft">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={outcome.outcome_status} />
                  <p className="text-xs text-[var(--surv-muted)]">{formatTimestamp(outcome.created_at)}</p>
                </div>
                <p className="mt-2 text-sm text-[var(--surv-text)]">
                  Restriction flag: {outcome.restriction_flag ? 'Yes' : 'No'}
                </p>
                {outcome.next_due_at ? (
                  <p className="mt-1 text-sm text-[var(--surv-text)]">
                    Next due: {formatDate(outcome.next_due_at)}
                  </p>
                ) : null}
                {outcome.operational_notes ? (
                  <p className="mt-2 text-sm text-[var(--surv-muted)]">{outcome.operational_notes}</p>
                ) : null}
              </div>
            ))
          )}

          {/* ── Review tasks ─────────────────────────────────────────── */}
          <div className="surv-card">
            <div>
              <h2 className="text-lg font-semibold text-[var(--surv-text)]">Review tasks</h2>
              <p className="mt-1 text-sm text-[var(--surv-muted)]">
                Review tasks track compliance follow-up actions for the occ health team — for example,
                confirming a new starter&apos;s baseline requirements, or reassessing surveillance after a role
                change. They do not store clinical information.
              </p>
            </div>

            <form action={createSurveillanceReviewTaskAction} className="mt-4 grid gap-3 border-b border-[var(--surv-border)] pb-5 md:grid-cols-2">
              <input type="hidden" name="surveillanceWorkerId" value={data.workerId} />

              <div className="md:col-span-2">
                <label htmlFor="taskType" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                  Task type <span className="text-[var(--surv-red-text)]">*</span>
                </label>
                <select id="taskType" name="taskType" required className="surv-input">
                  {Object.entries(REVIEW_TASK_LABELS).map(([value, label]) => (
                    <option key={value} value={value} title={REVIEW_TASK_DESCRIPTIONS[value]}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--surv-muted)]">
                  Select the type of review action needed. Each type routes the task to the appropriate compliance workflow.
                </p>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="enrolmentId" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                  Link to enrolment <span className="text-xs font-normal text-[var(--surv-muted)]">(optional)</span>
                </label>
                <select name="enrolmentId" id="enrolmentId" defaultValue="" className="surv-input">
                  <option value="">No enrolment linked</option>
                  {data.enrolments.map((enrolment) => (
                    <option key={enrolment.id} value={enrolment.id}>
                      {enrolment.requirement?.name ?? enrolment.program?.name ?? 'Requirement'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="dueAt" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                  Due by <span className="text-xs font-normal text-[var(--surv-muted)]">(optional)</span>
                </label>
                <input id="dueAt" name="dueAt" type="datetime-local" className="surv-input" />
              </div>

              <div>
                <label htmlFor="notesOperationalTask" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
                  Internal note <span className="text-xs font-normal text-[var(--surv-muted)]">(optional)</span>
                </label>
                <input id="notesOperationalTask" name="notesOperational" placeholder="Not visible to the worker" className="surv-input" />
              </div>

              <div className="md:col-span-2">
                <button type="submit" className="surv-btn-primary">
                  Create review task
                </button>
              </div>
            </form>

            {data.reviewTasks.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--surv-muted)]">No open or historical review tasks recorded yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.reviewTasks.map((task) => (
                  <div key={task.id} className="surv-card-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--surv-text)]">
                          {REVIEW_TASK_LABELS[task.task_type] ?? task.task_type.replaceAll('_', ' ')}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--surv-muted)]">
                          {REVIEW_TASK_DESCRIPTIONS[task.task_type]}
                        </p>
                      </div>
                      <StatusBadge status={task.status === 'in_progress' ? 'confirmed' : task.status === 'completed' ? 'completed' : task.status === 'cancelled' ? 'cancelled' : 'scheduled'} />
                    </div>
                    {task.due_at ? (
                      <p className="mt-1 text-xs text-[var(--surv-muted)]">Due {formatDate(task.due_at)}</p>
                    ) : null}
                    {task.notes_operational ? (
                      <p className="mt-2 text-sm text-[var(--surv-muted)]">{task.notes_operational}</p>
                    ) : null}
                    <form action={updateSurveillanceReviewTaskStatusAction} className="mt-3 flex flex-wrap gap-2">
                      <input type="hidden" name="taskId" value={task.id} />
                      <input type="hidden" name="surveillanceWorkerId" value={data.workerId} />
                      {task.status !== 'in_progress' ? (
                        <button type="submit" name="status" value="in_progress" className="surv-btn-secondary px-3 py-2 text-xs">
                          Mark in progress
                        </button>
                      ) : null}
                      {task.status !== 'completed' ? (
                        <button type="submit" name="status" value="completed" className="surv-btn-secondary px-3 py-2 text-xs">
                          Mark completed
                        </button>
                      ) : null}
                      {task.status !== 'cancelled' ? (
                        <button type="submit" name="status" value="cancelled" className="surv-btn-secondary px-3 py-2 text-xs">
                          Cancel task
                        </button>
                      ) : null}
                      {task.status !== 'open' ? (
                        <button type="submit" name="status" value="open" className="surv-btn-secondary px-3 py-2 text-xs">
                          Reopen
                        </button>
                      ) : null}
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Appointment history ──────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Appointment history</h2>
          <p className="text-sm text-[var(--surv-muted)]">
            All scheduled and completed appointments for this worker. Location and instructions are administrative only.
          </p>
        </div>
        {data.appointments.length === 0 ? (
          <div className="surv-empty">
            No appointments recorded for this worker.
          </div>
        ) : (
          <div className="surv-table">
            <table className="min-w-full divide-y divide-[var(--surv-border)] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Surveillance type</th>
                  <th className="px-4 py-3 font-medium">Scheduled</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surv-border)]">
                {data.appointments.map((appointment) => (
                  <tr key={appointment.id}>
                    <td className="px-4 py-3 text-[var(--surv-muted)]">
                      {appointment.requirement?.name ?? appointment.program?.name ?? 'Requirement'}
                    </td>
                    <td className="px-4 py-3 text-[var(--surv-muted)]">{formatTimestamp(appointment.scheduled_at)}</td>
                    <td className="px-4 py-3"><StatusBadge status={appointment.status} /></td>
                    <td className="px-4 py-3 text-[var(--surv-muted)]">{appointment.location ?? 'TBC'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
