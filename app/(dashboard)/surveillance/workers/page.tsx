import Link from 'next/link'
import MetricCard from '@/components/surveillance/MetricCard'
import EligibleWorkerList from '@/components/surveillance/EligibleWorkerList'
import AddWorkerModal from '@/components/surveillance/AddWorkerModal'
import BulkEnrollmentModal from '@/components/surveillance/BulkEnrollmentModal'
import { listSurveillanceEligibleWorkers, type SurveillanceComplianceStatus } from '@/lib/surveillance/queries'

const DEDICATED_QUEUES = [
  { href: '/surveillance/queues/overdue', label: 'Overdue' },
  { href: '/surveillance/queues/baseline', label: 'Needs baseline' },
  { href: '/surveillance/queues/due-soon', label: 'Due soon' },
  { href: '/surveillance/queues/review-tasks', label: 'Admin reviews' },
  { href: '/surveillance/queues/availability', label: 'Cannot book' },
] as const

function buildWorkersFilterHref(search: string | undefined, status: SurveillanceComplianceStatus | undefined) {
  const params = new URLSearchParams()
  if (search?.trim()) params.set('q', search.trim())
  if (status) params.set('status', status)
  const query = params.toString()
  return query ? `/surveillance/workers?${query}` : '/surveillance/workers'
}

function getStatusCount(data: { complianceSummary: Record<SurveillanceComplianceStatus, number> }, status: SurveillanceComplianceStatus) {
  return data.complianceSummary[status]
}

export default async function SurveillanceWorkersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; bulkResult?: string; bulkDueMode?: string }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedStatus = ['green', 'amber', 'red', 'grey'].includes(resolvedSearchParams?.status ?? '')
    ? (resolvedSearchParams?.status as SurveillanceComplianceStatus)
    : undefined
  const bulkResultCount = resolvedSearchParams?.bulkResult ? Number(resolvedSearchParams.bulkResult) : null
  const bulkDueMode = resolvedSearchParams?.bulkDueMode === 'custom' ? 'custom' : resolvedSearchParams?.bulkDueMode === 'unset' ? 'unset' : null

  const data = await listSurveillanceEligibleWorkers(resolvedSearchParams?.q, selectedStatus)

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">Worker surveillance intake is unavailable for this account.</div>
      </div>
    )
  }

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Workers</p>
          <h1 className="surv-title">Worker queue</h1>
          <p className="surv-subtitle">Find workers, open focused queues, and keep surveillance enrolments current.</p>
        </div>

        <div className="flex w-full flex-col gap-3 xl:max-w-4xl">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex flex-wrap gap-2">
              <AddWorkerModal availableRoles={data.availableRoles} availableSites={data.availableSites} />
              <BulkEnrollmentModal
                businessId={data.context.account.business_id}
                redirectTo={buildWorkersFilterHref(resolvedSearchParams?.q, selectedStatus)}
                availableSurveillanceTypes={data.availableSurveillanceTypes}
                availableSites={data.availableSites}
                availableRoles={data.availableRoles}
              />
            </div>
            <form className="flex min-w-0 flex-1 gap-2">
            {selectedStatus ? <input type="hidden" name="status" value={selectedStatus} /> : null}
            <input
              name="q"
              defaultValue={resolvedSearchParams?.q ?? ''}
              placeholder="Search workers or job roles"
              className="surv-input"
            />
            <button type="submit" className="surv-btn-primary">Search</button>
            </form>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href={buildWorkersFilterHref(resolvedSearchParams?.q, 'red')}>
          <MetricCard label="Red" value={data.complianceSummary.red} hint="Overdue now" tone="red" />
        </Link>
        <Link href={buildWorkersFilterHref(resolvedSearchParams?.q, 'grey')}>
          <MetricCard label="Grey" value={data.complianceSummary.grey} hint="Baseline or intake incomplete" tone="grey" />
        </Link>
        <Link href={buildWorkersFilterHref(resolvedSearchParams?.q, 'amber')}>
          <MetricCard label="Amber" value={data.complianceSummary.amber} hint="Due within 30 days" tone="amber" />
        </Link>
        <Link href={buildWorkersFilterHref(resolvedSearchParams?.q, 'green')}>
          <MetricCard label="Green" value={data.complianceSummary.green} hint={`${data.complianceSummary.fullyCurrentPercent}% fully current`} tone="green" />
        </Link>
      </div>

      <div className="surv-card space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="surv-kicker">Action queues</p>
            <p className="mt-1 text-sm text-[var(--surv-muted)]">Open a focused queue when you need to work through a specific problem.</p>
          </div>
          <Link href={buildWorkersFilterHref(resolvedSearchParams?.q, undefined)} className={`surv-chip w-fit ${!selectedStatus ? 'surv-chip-active' : ''}`}>
            All workers
            <span className="ml-2 rounded-full border border-current/30 px-2 py-0.5 text-[10px]">
              {data.complianceSummary.total}
            </span>
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEDICATED_QUEUES.map((queue) => (
            <Link key={queue.href} href={queue.href} className="surv-queue-card rounded-lg border border-[var(--surv-border)] bg-[var(--surv-card)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surv-panel-soft)]">
              {queue.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(['red', 'grey', 'amber', 'green'] as SurveillanceComplianceStatus[]).map((status) => (
            <Link key={status} href={buildWorkersFilterHref(resolvedSearchParams?.q, status)} className={`surv-chip ${selectedStatus === status ? 'surv-chip-active' : ''}`}>
              <span>{status}</span>
              <span className="ml-2 rounded-full border border-current/30 px-2 py-0.5 text-[10px]">
                {getStatusCount(data, status)}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {bulkResultCount !== null && !Number.isNaN(bulkResultCount) ? (
        <div className="surv-card border-[var(--surv-accent-border)] bg-[var(--surv-accent-soft)]">
          <p className="text-sm text-[var(--surv-text)]">
            Bulk enrolment finished for {bulkResultCount} worker{bulkResultCount === 1 ? '' : 's'}.
            {' '}
            {bulkDueMode === 'custom'
              ? 'A custom initial due date was applied to newly created enrolments.'
              : 'No initial due date was supplied, so new enrolments were created without an explicit first due date.'}
          </p>
        </div>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">All workers</h2>
          <p className="text-sm text-[var(--surv-muted)]">
            This is the broad worker directory. For daily actioning, use the dedicated queues above.
          </p>
        </div>
        <EligibleWorkerList workers={data.workers} emptyMessage="No surveillance-eligible workers matched this search." />
      </section>
    </div>
  )
}
