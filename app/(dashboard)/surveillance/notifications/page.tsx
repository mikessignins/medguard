import Link from 'next/link'
import NotificationLogTable from '@/components/surveillance/NotificationLogTable'
import {
  generateSurveillanceNotificationsAction,
  updateSurveillanceEscalationPolicyAction,
} from '@/lib/surveillance/actions'
import { listSurveillanceNotifications } from '@/lib/surveillance/queries'

function ThresholdHelp({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--surv-border)] text-[10px] font-semibold text-[var(--surv-muted)] outline-none transition hover:border-[var(--surv-accent-border)] hover:text-[var(--surv-text)] focus:border-[var(--surv-accent-border)] focus:text-[var(--surv-text)]"
        aria-label={text}
      >
        ?
      </span>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-64 -translate-x-1/2 rounded-lg border border-[var(--surv-border)] bg-[var(--surv-panel)] px-3 py-2 text-xs normal-case leading-relaxed tracking-normal text-[var(--surv-text)] shadow-xl group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  )
}

export default async function SurveillanceNotificationsPage() {
  let data = null

  try {
    data = await listSurveillanceNotifications()
  } catch (error) {
    console.error('[surveillance/notifications] failed to load notifications', error)
  }

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">Surveillance notifications are temporarily unavailable for this account.</div>
      </div>
    )
  }

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Notifications</p>
          <h1 className="surv-title">Notifications</h1>
          <p className="surv-subtitle">Reminder and escalation delivery log for occupational health scheduling.</p>
        </div>
        <Link href="/surveillance/escalations" className="surv-btn-secondary">
          Open escalations
        </Link>
      </div>

      <form action={generateSurveillanceNotificationsAction} className="surv-card">
        <input type="hidden" name="businessId" value={data.context.account.business_id} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="surv-kicker">Reminder engine</p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--surv-text)]">Generate in-app reminders now</h2>
            <p className="mt-1 text-sm text-[var(--surv-muted)]">
              Create current 30-day due, overdue, and day-of appointment entries in the notification log. Email reminders are sent by the scheduled SMTP sender when business email delivery is enabled.
            </p>
          </div>
          <button type="submit" className="surv-btn-primary">Generate in-app reminders</button>
        </div>
      </form>

      <form action={updateSurveillanceEscalationPolicyAction} className="surv-card">
        <input type="hidden" name="businessId" value={data.context.account.business_id} />
        <div>
          <p className="surv-kicker">Escalation policy</p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--surv-text)]">Overdue escalation thresholds</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">
            Escalations are administrative reminders only. They do not include clinical details or provider notes.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">
              Due-soon window
              <ThresholdHelp text="Creates a worker due-soon reminder when an active surveillance requirement falls inside this many days before its due date." />
            </span>
            <input
              name="dueSoonDays"
              type="number"
              min="1"
              max="180"
              defaultValue={data.escalationPolicy.due_soon_days}
              className="surv-input"
            />
          </label>
          <label className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">
              Occ health overdue
              <ThresholdHelp text="Creates an occ health escalation log entry once a surveillance requirement has been overdue for this many days. Zero means escalate to occ health as soon as it becomes overdue." />
            </span>
            <input
              name="occHealthOverdueDays"
              type="number"
              min="0"
              max="365"
              defaultValue={data.escalationPolicy.occ_health_overdue_days}
              className="surv-input"
            />
          </label>
          <label className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">
              Supervisor overdue
              <ThresholdHelp text="Creates a supervisor escalation log entry when the overdue threshold is reached. This is for operational follow-up only and does not include clinical details." />
            </span>
            <input
              name="supervisorOverdueDays"
              type="number"
              min="0"
              max="365"
              defaultValue={data.escalationPolicy.supervisor_overdue_days}
              className="surv-input"
            />
          </label>
          <label className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">
              Manager overdue
              <ThresholdHelp text="Creates a site or project manager escalation log entry when an overdue requirement remains unresolved for this many days." />
            </span>
            <input
              name="managerOverdueDays"
              type="number"
              min="0"
              max="365"
              defaultValue={data.escalationPolicy.manager_overdue_days}
              className="surv-input"
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-[var(--surv-text)]">
          <input name="isActive" type="hidden" value="false" />
          <input
            name="isActive"
            type="checkbox"
            value="true"
            defaultChecked={data.escalationPolicy.is_active}
            className="h-4 w-4 rounded border border-[var(--surv-border)]"
          />
          Create escalation log entries when overdue thresholds are reached
        </label>

        <div className="mt-4">
          <button type="submit" className="surv-btn-primary">Save escalation policy</button>
        </div>
      </form>

      {data.notifications.length === 0 ? (
        <div className="surv-empty">
          No surveillance notifications have been generated yet. Use the action above to create the current reminder set and populate the delivery log.
        </div>
      ) : (
        <NotificationLogTable notifications={data.notifications} />
      )}
    </div>
  )
}
