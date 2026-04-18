import Link from 'next/link'
import type { ReactNode } from 'react'
import WorkerSearchCombobox from '@/components/surveillance/WorkerSearchCombobox'
import { formatDate, formatTimestamp } from '@/lib/date-format'
import {
  getSurveillanceDashboardData,
  type SurveillanceAppointmentWithRequirement,
  type SurveillanceEligibleWorker,
} from '@/lib/surveillance/queries'

function ActionWorkerRow({
  worker,
  action,
}: {
  worker: SurveillanceEligibleWorker
  action: string
}) {
  return (
    <Link href={`/surveillance/workers/${worker.id}`} className="block">
      <div className="rounded-lg border border-[var(--surv-border)] bg-[var(--surv-card)] px-4 py-3 transition hover:bg-[var(--surv-panel-soft)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--surv-text)]">{worker.display_name}</p>
            <p className="mt-1 text-xs text-[var(--surv-muted)]">
              {worker.primaryRequirement?.name ?? worker.primaryProgram?.name ?? worker.selectedRole?.name ?? worker.job_role_name}
              {worker.nextDueAt ? ` • due ${formatDate(worker.nextDueAt)}` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-lg border border-[var(--surv-accent-border)] bg-[var(--surv-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--surv-text)]">
            {action}
          </span>
        </div>
      </div>
    </Link>
  )
}

function TodayAppointmentRow({ appointment }: { appointment: SurveillanceAppointmentWithRequirement }) {
  return (
    <Link href={`/surveillance/appointments/${appointment.id}`} className="block">
      <div className="rounded-lg border border-[var(--surv-border)] bg-[var(--surv-card)] px-4 py-3 transition hover:bg-[var(--surv-panel-soft)]">
        <p className="text-sm font-semibold text-[var(--surv-text)]">{appointment.worker_display_name}</p>
        <p className="mt-1 text-xs text-[var(--surv-muted)]">
          {formatTimestamp(appointment.scheduled_at)} • {appointment.requirement?.name ?? appointment.program?.name ?? 'Requirement'}
        </p>
      </div>
    </Link>
  )
}

function ActionBucket({
  title,
  href,
  count,
  empty,
  children,
}: {
  title: string
  href: string
  count: number
  empty: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--surv-text)]">{title}</h3>
        <Link href={href} className="text-xs font-medium text-[var(--surv-accent)] hover:underline">
          {count} total
        </Link>
      </div>
      {count > 0 ? children : <div className="surv-empty">{empty}</div>}
    </section>
  )
}

function StartHereCard({
  title,
  body,
  count,
  href,
  action,
  tone = 'normal',
}: {
  title: string
  body: string
  count: number
  href: string
  action: string
  tone?: 'normal' | 'urgent'
}) {
  return (
    <Link href={href} className="block">
      <div className={`h-full rounded-lg border p-4 transition hover:bg-[var(--surv-panel-soft)] ${
        tone === 'urgent'
          ? 'border-[var(--surv-red-text)] bg-[var(--surv-red-soft)]'
          : 'border-[var(--surv-border)] bg-[var(--surv-card)]'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--surv-text)]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--surv-muted)]">{body}</p>
          </div>
          <span className="rounded-lg border border-[var(--surv-accent-border)] bg-[var(--surv-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--surv-text)]">
            {count}
          </span>
        </div>
        <p className="mt-4 text-sm font-semibold text-[var(--surv-accent)]">{action}</p>
      </div>
    </Link>
  )
}

function GuidedQueueCard({
  title,
  body,
  count,
  href,
  action,
}: {
  title: string
  body: string
  count: number
  href: string
  action: string
}) {
  return (
    <Link href={href} className="surv-card-soft block text-[var(--surv-text)] transition hover:bg-[var(--surv-panel-soft)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--surv-text)]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--surv-muted)]">{body}</p>
        </div>
        <span className="rounded-lg border border-[var(--surv-accent-border)] bg-[var(--surv-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--surv-text)]">
          {count}
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold text-[var(--surv-accent)]">{action}</p>
    </Link>
  )
}

export default async function SurveillanceOverviewPage() {
  let data = null

  try {
    data = await getSurveillanceDashboardData()
  } catch (error) {
    console.error('[surveillance/overview] failed to load dashboard data', error)
  }

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">
          Health surveillance is temporarily unavailable for this account. Check that occ health access is approved, the module is enabled for the business, and the surveillance records are populated with valid schedule dates.
        </div>
      </div>
    )
  }

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Overview</p>
          <h1 className="surv-title">Start here</h1>
          <p className="surv-subtitle">Today&apos;s occ health work, ordered by what needs attention first.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/surveillance/workers" className="surv-btn-secondary">
            Worker list
          </Link>
          <Link href="/surveillance/appointments" className="surv-btn-primary">
            Appointments
          </Link>
        </div>
      </div>

      <section className="surv-card">
        <div className="grid gap-5 xl:grid-cols-[0.95fr,1.35fr]">
          <div>
            <p className="surv-kicker">Start here</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--surv-text)]">What should I do next?</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--surv-muted)]">
              Use these cards first. They show who needs attention, whether they are likely bookable, and where to click next.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StartHereCard
              title="Schedule overdue workers"
              body="Workers already past due and currently on site."
              count={data.actionWorkers.overdueOnSite.length}
              href="/surveillance/queues/overdue"
              action="Open overdue"
              tone="urgent"
            />
            <StartHereCard
              title="Plan due-soon bookings"
              body="Workers due soon who are currently on site."
              count={data.actionWorkers.dueSoonOnSite.length}
              href="/surveillance/queues/due-soon"
              action="Open due soon"
            />
            <StartHereCard
              title="Clear escalations"
              body="Overdue follow-ups that need acknowledgement."
              count={data.openEscalationCount}
              href="/surveillance/escalations"
              action="Open escalations"
              tone={data.openEscalationCount > 0 ? 'urgent' : 'normal'}
            />
            <StartHereCard
              title="Fix missing rosters"
              body="Add roster data so the system can avoid R&R."
              count={data.actionWorkers.missingRoster.length}
              href="/surveillance/workers"
              action="Open workers"
            />
          </div>
        </div>
      </section>

      <section className="surv-card">
        <WorkerSearchCombobox workers={data.workerLookup} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr,0.9fr]">
        <section className="surv-card">
          <h2 className="text-xl font-semibold text-[var(--surv-text)]">Today</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">Bookings and workers that can be actioned today.</p>
          <div className="mt-5 space-y-5">
            <ActionBucket
              title="Appointments today"
              href="/surveillance/appointments"
              count={data.todayAppointments.length}
              empty="No appointments are booked today. Check due-soon workers next to plan upcoming appointments."
            >
              <div className="space-y-2">
                {data.todayAppointments.slice(0, 4).map((appointment) => (
                  <TodayAppointmentRow key={appointment.id} appointment={appointment} />
                ))}
              </div>
            </ActionBucket>

            <ActionBucket
              title="Overdue and on site"
              href="/surveillance/queues/overdue"
              count={data.actionWorkers.overdueOnSite.length}
              empty="No overdue workers are currently on site. Check due-soon workers or missing rosters next."
            >
              <div className="space-y-2">
                {data.actionWorkers.overdueOnSite.slice(0, 4).map((worker) => (
                  <ActionWorkerRow key={worker.id} worker={worker} action="Schedule" />
                ))}
              </div>
            </ActionBucket>
          </div>
        </section>

        <section className="surv-card">
          <h2 className="text-xl font-semibold text-[var(--surv-text)]">Plan</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">Remove blockers before they become overdue work.</p>
          <div className="mt-5 space-y-5">
            <ActionBucket
              title="Admin reviews"
              href="/surveillance/queues/review-tasks"
              count={data.queueSummary.reviewTasks}
              empty="No admin reviews are waiting. New starter, role change, and transfer reviews will appear here."
            >
              <div className="space-y-2">
                {data.actionWorkers.reviewTasks.slice(0, 4).map((worker) => (
                  <ActionWorkerRow key={worker.id} worker={worker} action="Review" />
                ))}
              </div>
            </ActionBucket>

            <ActionBucket
              title="Cannot book right now"
              href="/surveillance/queues/availability"
              count={data.queueSummary.availability}
              empty="No active availability blockers are recorded. Roster and leave conflicts will appear here."
            >
              <div className="space-y-2">
                {data.actionWorkers.availability.slice(0, 4).map((worker) => (
                  <ActionWorkerRow key={worker.id} worker={worker} action="Check" />
                ))}
              </div>
            </ActionBucket>
          </div>
        </section>
      </div>

      <section className="surv-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--surv-text)]">Guided queues</h2>
            <p className="mt-1 text-sm text-[var(--surv-muted)]">Open the queue that matches the job you are trying to finish.</p>
          </div>
          <Link href="/surveillance/compliance" className="surv-btn-secondary">
            View compliance metrics
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <GuidedQueueCard
            title="Overdue"
            body="These workers are already past their due date. Start here when the count is above zero."
            count={data.queueSummary.overdue}
            href="/surveillance/queues/overdue"
            action="Open overdue"
          />
          <GuidedQueueCard
            title="Needs baseline"
            body="These workers cannot be marked current until their first assessment is arranged."
            count={data.queueSummary.baseline}
            href="/surveillance/queues/baseline"
            action="Open baselines"
          />
          <GuidedQueueCard
            title="Due soon"
            body="Plan these bookings before they become overdue work."
            count={data.queueSummary.dueSoon}
            href="/surveillance/queues/due-soon"
            action="Open due soon"
          />
          <GuidedQueueCard
            title="Admin reviews"
            body="New starter, role change, transfer, and self-declared surveillance reviews."
            count={data.queueSummary.reviewTasks}
            href="/surveillance/queues/review-tasks"
            action="Open reviews"
          />
          <GuidedQueueCard
            title="Cannot book"
            body="Leave, training, R&R, or other availability issues are blocking scheduling."
            count={data.queueSummary.availability}
            href="/surveillance/queues/availability"
            action="Review availability"
          />
        </div>
      </section>
    </div>
  )
}
