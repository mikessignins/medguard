import MetricCard from '@/components/surveillance/MetricCard'
import { getSurveillanceReportsSummary } from '@/lib/surveillance/queries'

export default async function SurveillanceReportsPage() {
  let data = null

  try {
    data = await getSurveillanceReportsSummary()
  } catch (error) {
    console.error('[surveillance/reports] failed to load reports summary', error)
  }

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">Surveillance reporting is temporarily unavailable for this account.</div>
      </div>
    )
  }

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Reports</p>
          <h1 className="surv-title">Reports</h1>
          <p className="surv-subtitle">Operational reporting for compliance, queue pressure, and workforce planning.</p>
        </div>
        <a href="/api/surveillance/reports/summary-csv" className="surv-btn-primary">
          Export summary CSV
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Workers" value={data.workerCount} />
        <MetricCard label="Review tasks" value={data.openReviewTaskCount} hint="New starters, transfers, and review queue" tone="amber" />
        <MetricCard label="Availability" value={data.workersWithAvailabilityConflicts} hint="Current leave or availability exceptions" tone="grey" />
        <MetricCard label="Appointments" value={data.metrics.upcoming_count} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Green" value={data.complianceSummary.green} hint={`${data.complianceSummary.fullyCurrentPercent}% fully current`} tone="green" />
        <MetricCard label="Amber" value={data.complianceSummary.amber} hint="Due within 30 days" tone="amber" />
        <MetricCard label="Red" value={data.complianceSummary.red} hint="Overdue now" tone="red" />
        <MetricCard label="Grey" value={data.complianceSummary.grey} hint="Baseline or intake incomplete" tone="grey" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surv-card">
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Workforce mix</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--surv-muted)]">App workers</dt>
              <dd className="text-[var(--surv-text)]">{data.appWorkerCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--surv-muted)]">Manual-entry workers</dt>
              <dd className="text-[var(--surv-text)]">{data.manualWorkerCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--surv-muted)]">Active enrolments</dt>
              <dd className="text-[var(--surv-text)]">{data.metrics.active_enrolment_count}</dd>
            </div>
          </dl>
        </section>

        <section className="surv-card">
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Near-term workload</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--surv-muted)]">Due soon</dt>
              <dd className="text-[var(--surv-text)]">{data.metrics.due_soon_count}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--surv-muted)]">Overdue</dt>
              <dd className="text-[var(--surv-text)]">{data.metrics.overdue_count}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--surv-muted)]">Completed this week</dt>
              <dd className="text-[var(--surv-text)]">{data.metrics.completed_week_count}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="surv-card">
        <h2 className="text-lg font-semibold text-[var(--surv-text)]">Site compliance</h2>
        <p className="mt-1 text-sm text-[var(--surv-muted)]">Worker compliance split by assigned site.</p>
        {data.siteBreakdown.length === 0 ? (
          <div className="surv-empty mt-4">No site compliance data is available yet.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--surv-border)] text-left text-[var(--surv-muted)]">
                  <th className="px-3 py-2 font-medium">Site</th>
                  <th className="px-3 py-2 text-right font-medium">Workers</th>
                  <th className="px-3 py-2 text-right font-medium">Green</th>
                  <th className="px-3 py-2 text-right font-medium">Amber</th>
                  <th className="px-3 py-2 text-right font-medium">Red</th>
                  <th className="px-3 py-2 text-right font-medium">Grey</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surv-border)]">
                {data.siteBreakdown.map((row) => (
                  <tr key={row.siteId ?? 'unassigned'}>
                    <td className="px-3 py-2 text-[var(--surv-text)]">{row.siteName}</td>
                    <td className="px-3 py-2 text-right text-[var(--surv-muted)]">{row.workerCount}</td>
                    <td className="px-3 py-2 text-right text-[var(--surv-green-text)]">{row.green}</td>
                    <td className="px-3 py-2 text-right text-[var(--surv-accent)]">{row.amber}</td>
                    <td className="px-3 py-2 text-right text-[var(--surv-red-text)]">{row.red}</td>
                    <td className="px-3 py-2 text-right text-[var(--surv-grey-text)]">{row.grey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surv-card">
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Requirement workload</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">Active enrolments by surveillance requirement.</p>
          {data.requirementBreakdown.length === 0 ? (
            <div className="surv-empty mt-4">No active requirement enrolments are available yet.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--surv-border)] text-left text-[var(--surv-muted)]">
                    <th className="px-3 py-2 font-medium">Requirement</th>
                    <th className="px-3 py-2 text-right font-medium">Active</th>
                    <th className="px-3 py-2 text-right font-medium">Baseline</th>
                    <th className="px-3 py-2 text-right font-medium">Due</th>
                    <th className="px-3 py-2 text-right font-medium">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--surv-border)]">
                  {data.requirementBreakdown.map((row) => (
                    <tr key={row.requirementId}>
                      <td className="px-3 py-2 text-[var(--surv-text)]">{row.requirementName}</td>
                      <td className="px-3 py-2 text-right text-[var(--surv-muted)]">{row.activeEnrolments}</td>
                      <td className="px-3 py-2 text-right text-[var(--surv-grey-text)]">{row.baselineIncomplete}</td>
                      <td className="px-3 py-2 text-right text-[var(--surv-accent)]">{row.dueSoon}</td>
                      <td className="px-3 py-2 text-right text-[var(--surv-red-text)]">{row.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="surv-card">
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Provider workload</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">Appointment load by provider and clinic location.</p>
          {data.providerBreakdown.length === 0 ? (
            <div className="surv-empty mt-4">No provider appointments are available yet.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--surv-border)] text-left text-[var(--surv-muted)]">
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 text-right font-medium">Scheduled</th>
                    <th className="px-3 py-2 text-right font-medium">Done</th>
                    <th className="px-3 py-2 text-right font-medium">DNA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--surv-border)]">
                  {data.providerBreakdown.map((row) => (
                    <tr key={`${row.providerId ?? 'unassigned'}:${row.providerLocationId ?? 'none'}`}>
                      <td className="px-3 py-2 text-[var(--surv-text)]">{row.providerName}</td>
                      <td className="px-3 py-2 text-[var(--surv-muted)]">{row.providerLocationName}</td>
                      <td className="px-3 py-2 text-right text-[var(--surv-muted)]">{row.scheduled}</td>
                      <td className="px-3 py-2 text-right text-[var(--surv-green-text)]">{row.completed}</td>
                      <td className="px-3 py-2 text-right text-[var(--surv-red-text)]">{row.didNotAttend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
