import Link from 'next/link'
import MetricCard from '@/components/surveillance/MetricCard'
import { getSurveillanceDashboardData } from '@/lib/surveillance/queries'

function getComplianceRingStyle(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0)

  if (total === 0) {
    return { background: 'conic-gradient(var(--surv-grey-soft) 0deg 360deg)' }
  }

  const [current, dueSoon, overdue] = values
  const currentDeg = (current / total) * 360
  const dueSoonDeg = (dueSoon / total) * 360
  const overdueDeg = (overdue / total) * 360

  return {
    background: `conic-gradient(
      var(--surv-green-text) 0deg ${currentDeg}deg,
      var(--surv-accent) ${currentDeg}deg ${currentDeg + dueSoonDeg}deg,
      var(--surv-gold-text) ${currentDeg + dueSoonDeg}deg ${currentDeg + dueSoonDeg + overdueDeg}deg,
      var(--surv-grey-text) ${currentDeg + dueSoonDeg + overdueDeg}deg 360deg
    )`,
  }
}

export default async function SurveillanceCompliancePage() {
  let data = null

  try {
    data = await getSurveillanceDashboardData()
  } catch (error) {
    console.error('[surveillance/compliance] failed to load compliance data', error)
  }

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">Compliance metrics are temporarily unavailable for this account.</div>
      </div>
    )
  }

  const complianceRingStyle = getComplianceRingStyle([
    data.complianceSummary.green,
    data.complianceSummary.amber,
    data.complianceSummary.red,
    data.complianceSummary.grey,
  ])

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Compliance</p>
          <h1 className="surv-title">Compliance metrics</h1>
          <p className="surv-subtitle">Population status, queue pressure, and near-term workload.</p>
        </div>
        <Link href="/surveillance" className="surv-btn-secondary">
          Back to start
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr,1.1fr]">
        <section className="surv-card">
          <h2 className="text-xl font-semibold text-[var(--surv-text)]">Overall status</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">Current state across enrolled surveillance workers.</p>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="relative mx-auto h-60 w-60 shrink-0">
              <div className="absolute inset-0 rounded-full" style={complianceRingStyle} />
              <div className="absolute inset-[28px] grid place-items-center rounded-full border border-[var(--surv-border)] bg-[var(--surv-panel)]">
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--surv-muted)]">Current</p>
                  <p className="mt-2 text-5xl font-semibold tracking-tight text-[var(--surv-text)]">
                    {data.complianceSummary.fullyCurrentPercent}%
                  </p>
                  <p className="mt-1 text-sm text-[var(--surv-muted)]">fully current</p>
                </div>
              </div>
            </div>

            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <MetricCard label="Current" value={data.complianceSummary.green} hint="All active requirements are in date" tone="green" />
              <MetricCard label="Due soon" value={data.complianceSummary.amber} hint="At least one requirement is due soon" tone="amber" />
              <MetricCard label="Overdue" value={data.complianceSummary.red} hint="At least one requirement is overdue" tone="red" />
              <MetricCard label="Needs setup" value={data.complianceSummary.grey} hint="Baseline or assignment setup is incomplete" tone="grey" />
            </div>
          </div>
        </section>

        <section className="surv-card">
          <h2 className="text-xl font-semibold text-[var(--surv-text)]">Queue pressure</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">Use these counts to understand workload, not daily task order.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <MetricCard label="Appointments today" value={data.todayAppointments.length} />
            <MetricCard label="Upcoming appointments" value={data.metrics.upcoming_count} />
            <MetricCard label="Open admin reviews" value={data.queueSummary.reviewTasks} tone="amber" />
            <MetricCard label="Cannot book right now" value={data.queueSummary.availability} tone="grey" />
          </div>
        </section>
      </div>
    </div>
  )
}
