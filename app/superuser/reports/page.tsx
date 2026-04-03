import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

interface SearchParams {
  business_id?: string
  site_id?: string
  from?: string
  to?: string
}

interface DeidentifiedConditionMetric {
  metric_group: string
  display_order: number
  metric_key: string
  metric_label: string
  affected_workers: number | null
  cohort_workers: number | null
  prevalence_percent: number | null
  is_suppressed: boolean
}

export default async function SuperuserReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') redirect('/')

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: businesses } = await service
    .from('businesses')
    .select('id, name')
    .order('name', { ascending: true })

  const selectedBusinessId = searchParams.business_id ?? ''
  const selectedSiteId = searchParams.site_id ?? 'all'
  const fromDate = searchParams.from ?? ''
  const toDate = searchParams.to ?? ''

  const { data: sites } = selectedBusinessId
    ? await service
      .from('sites')
      .select('id, name')
      .eq('business_id', selectedBusinessId)
      .order('name', { ascending: true })
    : { data: [] as Array<{ id: string; name: string }> }

  let metrics: DeidentifiedConditionMetric[] = []
  let reportError: string | null = null

  if (selectedBusinessId) {
    const { data, error } = await supabase.rpc('get_business_deidentified_health_report_filtered', {
      p_business_id: selectedBusinessId,
      p_site_id: selectedSiteId === 'all' ? null : selectedSiteId,
      p_from: fromDate ? `${fromDate}T00:00:00Z` : null,
      p_to: toDate ? `${toDate}T23:59:59Z` : null,
    })
    if (error) reportError = error.message
    metrics = (data || []) as DeidentifiedConditionMetric[]
  }

  const selectedBusinessName =
    businesses?.find((biz) => biz.id === selectedBusinessId)?.name ?? ''
  const selectedSiteName =
    selectedSiteId === 'all'
      ? 'All sites'
      : (sites || []).find((site) => site.id === selectedSiteId)?.name ?? 'Selected site'

  const pdfHref = selectedBusinessId
    ? `/api/superuser/reports/deidentified-pdf?business_id=${encodeURIComponent(selectedBusinessId)}&site_id=${encodeURIComponent(selectedSiteId)}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
    : null

  const allSuppressed = metrics.length > 0 && metrics.every((m) => m.is_suppressed)
  const cohortWorkers = metrics.find((m) => !m.is_suppressed && m.cohort_workers != null)?.cohort_workers ?? null
  const groupedMetrics = metrics.reduce<Record<string, DeidentifiedConditionMetric[]>>((acc, row) => {
    acc[row.metric_group] ??= []
    acc[row.metric_group].push(row)
    return acc
  }, {})

  const highlightKeys = ['anaphylaxis_risk', 'anaphylaxis_without_device', 'flagged_medication', 'interpreter_support']
  const highlightMetrics = highlightKeys
    .map((key) => metrics.find((m) => m.metric_key === key))
    .filter((metric): metric is DeidentifiedConditionMetric => Boolean(metric))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Workforce Health Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          De-identified superuser reporting only. Outputs contain aggregate counts and percentages, never worker-level data.
        </p>
      </div>

      <form className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-5 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Business</label>
          <select
            name="business_id"
            defaultValue={selectedBusinessId}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)]"
            required
          >
            <option value="">Select business…</option>
            {(businesses || []).map((biz) => (
              <option key={biz.id} value={biz.id}>{biz.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Site</label>
          <select
            name="site_id"
            defaultValue={selectedSiteId}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)]"
          >
            <option value="all">All sites</option>
            {(sites || []).map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">From</label>
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">To</label>
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)]"
          />
        </div>

        <div className="md:col-span-5 flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
          >
            Pull Report
          </button>
          {pdfHref && (
            <a
              href={pdfHref}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
            >
              Export PDF
            </a>
          )}
        </div>
      </form>

      {selectedBusinessId && (
        <div className="rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)]">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-base font-semibold text-[var(--text-1)]">Report Output</h2>
            <p className="mt-1 text-xs text-[var(--text-2)]">
              Business: {selectedBusinessName || selectedBusinessId} · Site: {selectedSiteName}
              {fromDate ? ` · From: ${fromDate}` : ''}{toDate ? ` · To: ${toDate}` : ''}
            </p>
          </div>

          {reportError ? (
            <p className="px-5 py-4 text-sm text-red-600">{reportError}</p>
          ) : metrics.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[var(--text-2)]">No metrics available for this filter.</p>
          ) : (
            <>
              {allSuppressed && (
                <div className="border-b border-[var(--border)] bg-amber-500/10 px-5 py-3 text-xs text-amber-700 dark:text-amber-300">
                  Results are suppressed because the cohort is below the minimum threshold.
                </div>
              )}
              <div className="space-y-6 px-5 py-5">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Cohort</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                      {allSuppressed ? 'Suppressed' : (cohortWorkers ?? '0')}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-2)]">Latest snapshot per worker in filter window</p>
                  </div>
                  {highlightMetrics.map((metric) => (
                    <div key={metric.metric_key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">{metric.metric_label}</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {metric.is_suppressed ? 'Suppressed' : `${metric.prevalence_percent ?? 0}%`}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-2)]">
                        {metric.is_suppressed ? 'Below minimum cohort threshold' : `${metric.affected_workers ?? 0} workers`}
                      </p>
                    </div>
                  ))}
                </div>

                {Object.entries(groupedMetrics).map(([groupName, rows]) => (
                  <section key={groupName} className="overflow-x-auto rounded-xl border border-[var(--border)]">
                    <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
                      <h3 className="text-sm font-semibold text-[var(--text-1)]">{groupName}</h3>
                      <p className="mt-1 text-xs text-[var(--text-2)]">
                        {groupName === 'Emergency Planning'
                          ? 'Signals that help plan emergency response, communication support, and medication follow-up.'
                          : 'De-identified prevalence of key conditions and workforce health signals.'}
                      </p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]">
                          <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Metric</th>
                          <th className="px-4 py-3 text-center font-medium text-[var(--text-2)]">Affected</th>
                          <th className="px-4 py-3 text-center font-medium text-[var(--text-2)]">Cohort</th>
                          <th className="px-4 py-3 text-center font-medium text-[var(--text-2)]">Prevalence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, idx) => (
                          <tr key={row.metric_key} className={idx > 0 ? 'border-t border-[var(--border)]' : ''}>
                            <td className="px-4 py-3 text-[var(--text-1)]">{row.metric_label}</td>
                            <td className="px-4 py-3 text-center text-[var(--text-2)]">{row.is_suppressed ? 'Suppressed' : row.affected_workers}</td>
                            <td className="px-4 py-3 text-center text-[var(--text-2)]">{row.is_suppressed ? 'Suppressed' : row.cohort_workers}</td>
                            <td className="px-4 py-3 text-center text-[var(--text-2)]">{row.is_suppressed ? 'Suppressed' : `${row.prevalence_percent ?? 0}%`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
