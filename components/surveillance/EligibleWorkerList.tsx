'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatDate, formatTimestamp } from '@/lib/date-format'
import { isOnSiteOnDate, nextFlyIn, nextFlyOut } from '@/lib/surveillance/swing-schedule'
import type { CycleSegment } from '@/lib/surveillance/roster-patterns'
import type { SurveillanceEligibleWorker } from '@/lib/surveillance/queries'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function getComplianceBadgeClass(status: SurveillanceEligibleWorker['complianceStatus']) {
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

function getComplianceReasonLabel(reason: SurveillanceEligibleWorker['complianceReason']) {
  switch (reason) {
    case 'no_active_assignments':
      return 'No active assignments'
    case 'baseline_incomplete':
      return 'Baseline incomplete'
    case 'overdue':
      return 'Overdue requirement'
    case 'due_soon':
      return 'Due within 30 days'
    case 'current':
    default:
      return 'Current'
  }
}

function getAvailabilityLabel(worker: SurveillanceEligibleWorker) {
  if (worker.currentAvailabilityException) {
    return `Unavailable: ${worker.currentAvailabilityException.exception_type.replaceAll('_', ' ')} until ${formatDate(worker.currentAvailabilityException.ends_at)}`
  }

  if (!worker.roster?.anchor_date || !isRosterCycle(worker.roster.roster_cycle_json)) {
    return 'No roster recorded'
  }

  const anchorDate = new Date(`${worker.roster.anchor_date}T00:00:00`)
  if (Number.isNaN(anchorDate.getTime())) {
    return 'No roster recorded'
  }

  if (isOnSiteOnDate(anchorDate, worker.roster.roster_cycle_json, new Date())) {
    const flyOut = nextFlyOut(anchorDate, worker.roster.roster_cycle_json, new Date())
    return flyOut ? `On site until ${formatDate(flyOut.toISOString())}` : 'On site'
  }

  const flyIn = nextFlyIn(anchorDate, worker.roster.roster_cycle_json, new Date())
  return flyIn ? `R&R - returns ${formatDate(flyIn.toISOString())}` : 'R&R'
}

function isRosterCycle(value: NonNullable<SurveillanceEligibleWorker['roster']>['roster_cycle_json'] | undefined): value is CycleSegment[] {
  return Array.isArray(value) && value.every((segment) => (
    typeof segment.days === 'number' && segment.days > 0 && (segment.period === 'on' || segment.period === 'off')
  ))
}

function getAvailabilityChipClass(worker: SurveillanceEligibleWorker) {
  const label = getAvailabilityLabel(worker)
  if (label.startsWith('On site')) {
    return 'border-[var(--surv-green-text)] bg-[var(--surv-green-soft)] text-[var(--surv-green-text)]'
  }
  if (label.startsWith('Unavailable')) {
    return 'border-[var(--surv-red-text)] bg-[var(--surv-red-soft)] text-[var(--surv-red-text)]'
  }
  if (label.startsWith('No roster')) {
    return 'border-[var(--surv-border)] bg-[var(--surv-grey-soft)] text-[var(--surv-grey-text)]'
  }
  return 'border-[var(--surv-accent-border)] bg-[var(--surv-accent-soft)] text-[var(--surv-accent)]'
}

export default function EligibleWorkerList({
  workers,
  emptyMessage = 'No workers found.',
  initialPageSize = 25,
}: {
  workers: SurveillanceEligibleWorker[]
  emptyMessage?: string
  initialPageSize?: number
}) {
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [page, setPage] = useState(1)

  const visiblePageSize = PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : 25
  const totalPages = Math.max(1, Math.ceil(workers.length / visiblePageSize))
  const currentPage = Math.min(page, totalPages)
  const firstIndex = (currentPage - 1) * visiblePageSize
  const visibleWorkers = useMemo(
    () => workers.slice(firstIndex, firstIndex + visiblePageSize),
    [firstIndex, visiblePageSize, workers],
  )
  const startCount = workers.length === 0 ? 0 : firstIndex + 1
  const endCount = Math.min(firstIndex + visiblePageSize, workers.length)

  if (workers.length === 0) {
    return (
      <div className="surv-empty">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="surv-card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-[var(--surv-muted)]">
          Showing {startCount}-{endCount} of {workers.length} worker{workers.length === 1 ? '' : 's'}.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-[var(--surv-muted)]">
            <span>Show</span>
            <select
              value={visiblePageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
              className="surv-input w-32"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} rows</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="surv-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="min-w-20 text-center text-sm text-[var(--surv-muted)]">
              {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage === totalPages}
              className="surv-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {visibleWorkers.map((worker) => (
        <div key={worker.id} className="surv-card-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <Link href={`/surveillance/workers/${worker.id}`} className="surv-worker-title-link text-sm font-semibold hover:underline">
                {worker.display_name}
              </Link>
              <p className="text-xs text-[var(--surv-muted)]">
                {worker.selectedRole?.name ?? worker.job_role_name}
                {worker.primaryRequirement ? ` • ${worker.primaryRequirement.name}` : worker.primaryProgram ? ` • ${worker.primaryProgram.name}` : ''}
              </p>
              {(worker.phone || worker.email || worker.site_name) ? (
                <p className="text-xs text-[var(--surv-muted)]">
                  {worker.phone ? worker.phone : worker.email ?? 'No contact'}
                  {worker.site_name ? ` • ${worker.site_name}` : ''}
                </p>
              ) : null}
              <p className="text-xs text-[var(--surv-muted)]">
                {worker.activeEnrolmentCount > 0 ? `${worker.activeEnrolmentCount} active enrolment${worker.activeEnrolmentCount === 1 ? '' : 's'}` : 'Not enrolled yet'}
                {worker.nextAppointmentAt ? ` • next appointment ${formatTimestamp(worker.nextAppointmentAt)}` : ''}
                {!worker.nextAppointmentAt && worker.nextDueAt ? ` • next due ${formatDate(worker.nextDueAt)}` : ''}
              </p>
              <p className="text-xs text-[var(--surv-muted)]">{getComplianceReasonLabel(worker.complianceReason)}</p>
              <div className={`inline-flex w-fit rounded-lg border px-2.5 py-1 text-xs font-medium ${getAvailabilityChipClass(worker)}`}>
                {getAvailabilityLabel(worker)}
              </div>
              {worker.openReviewTaskCount > 0 ? (
                <p className="text-xs text-[color:var(--surv-gold-text)]">
                  {worker.openReviewTaskCount} open review task{worker.openReviewTaskCount === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase ${getComplianceBadgeClass(worker.complianceStatus)}`}>
                {worker.complianceStatus}
              </div>
              <div className="rounded-full border border-[var(--surv-border)] bg-[var(--surv-panel-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--surv-muted)]">
                {worker.worker_source === 'manual_entry' ? 'Manual entry' : 'App worker'}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
