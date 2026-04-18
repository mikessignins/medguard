import Link from 'next/link'
import StatusBadge from '@/components/surveillance/StatusBadge'
import { acknowledgeSurveillanceEscalationAction } from '@/lib/surveillance/actions'
import {
  listSurveillanceEscalations,
  type SurveillanceEscalationQueueItem,
} from '@/lib/surveillance/queries'
import { formatTimestamp } from '@/lib/date-format'

function formatEscalationType(value: string) {
  switch (value) {
    case 'escalation_occ_health':
      return 'Occ health follow-up'
    case 'escalation_supervisor':
      return 'Supervisor follow-up'
    case 'escalation_manager':
      return 'Manager follow-up'
    default:
      return value.replaceAll('_', ' ')
  }
}

function formatRecipients(escalation: SurveillanceEscalationQueueItem) {
  if (escalation.recipients.length === 0) return 'No recipients logged'
  return escalation.recipients
    .map((recipient) => recipient.target_role ?? recipient.delivery_address ?? 'Recipient')
    .join(', ')
}

function EscalationCard({ escalation }: { escalation: SurveillanceEscalationQueueItem }) {
  return (
    <div className="surv-card-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-[var(--surv-red-text)] bg-[var(--surv-red-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--surv-text)]">
              {formatEscalationType(escalation.notification_type)}
            </span>
            <StatusBadge status={escalation.delivery_status === 'sent' ? 'completed' : 'scheduled'} />
            <span className="text-xs font-medium text-[var(--surv-muted)]">
              Open {escalation.daysOpen === 1 ? '1 day' : `${escalation.daysOpen} days`}
            </span>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[var(--surv-text)]">
              {escalation.workerDisplayName ? (
                <Link href={`/surveillance/workers/${escalation.surveillance_worker_id}`} className="surv-worker-title-link">
                  {escalation.workerDisplayName}
                </Link>
              ) : (
                'Worker'
              )}
            </h2>
            <p className="mt-1 text-sm text-[var(--surv-muted)]">
              Scheduled {formatTimestamp(escalation.scheduled_for)} via {escalation.delivery_channel}
            </p>
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">Recipients</p>
              <p className="mt-1 text-[var(--surv-text)]">{formatRecipients(escalation)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">Action</p>
              <p className="mt-1 text-[var(--surv-text)]">Confirm the operational follow-up has been handled.</p>
            </div>
          </div>

          {escalation.delivery_error ? (
            <p className="rounded-lg border border-[var(--surv-red-text)] bg-[var(--surv-red-soft)] px-3 py-2 text-sm text-[var(--surv-red-text)]">
              {escalation.delivery_error}
            </p>
          ) : null}
        </div>

        <form action={acknowledgeSurveillanceEscalationAction} className="shrink-0">
          <input type="hidden" name="notificationId" value={escalation.id} />
          <button type="submit" className="surv-btn-primary">
            Acknowledge
          </button>
        </form>
      </div>
    </div>
  )
}

export default async function SurveillanceEscalationsPage() {
  let data = null

  try {
    data = await listSurveillanceEscalations()
  } catch (error) {
    console.error('[surveillance/escalations] failed to load escalation queue', error)
  }

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">Surveillance escalations are temporarily unavailable for this account.</div>
      </div>
    )
  }

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Escalations</p>
          <h1 className="surv-title">Open escalations</h1>
          <p className="surv-subtitle">
            Operational follow-up items created when overdue surveillance thresholds are reached.
          </p>
        </div>
        <Link href="/surveillance/notifications" className="surv-btn-secondary">
          Notification log
        </Link>
      </div>

      {data.escalations.length === 0 ? (
        <div className="surv-empty">
          No open escalation follow-ups. Escalations will appear here after the reminder engine reaches the configured overdue thresholds.
        </div>
      ) : (
        <div className="space-y-4">
          {data.escalations.map((escalation) => (
            <EscalationCard key={escalation.id} escalation={escalation} />
          ))}
        </div>
      )}
    </div>
  )
}
