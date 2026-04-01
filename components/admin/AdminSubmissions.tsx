'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'

interface SubmissionItem {
  submitted_at: string
  status: string
  site_id: string | null
}

interface MedDeclarationItem {
  submitted_at: string
  medic_review_status: string | null
  site_id: string | null
}

interface SiteItem {
  id: string
  name: string
}

interface Props {
  submissions: SubmissionItem[]
  medDeclarations: MedDeclarationItem[]
  sites: SiteItem[]
}

function getMonthKey(dateStr: string) {
  try {
    return format(new Date(dateStr), 'yyyy-MM')
  } catch {
    return 'Unknown'
  }
}

function formatMonth(key: string) {
  try {
    const [year, month] = key.split('-')
    return format(new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1), 'MMMM yyyy')
  } catch {
    return key
  }
}

function buildSiteNameMap(sites: SiteItem[]) {
  return new Map(sites.map(site => [site.id, site.name]))
}

function BreakdownTable({
  title,
  emptyLabel,
  rows,
  valueLabel,
}: {
  title: string
  emptyLabel: string
  rows: Array<{ label: string; value: number }>
  valueLabel: string
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700/50">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Label</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.label} className={index > 0 ? 'border-t border-slate-700/50' : ''}>
                <td className="px-5 py-3 text-slate-300">{row.label}</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-slate-100">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string
  value: number
  tone: 'slate' | 'amber' | 'emerald' | 'red' | 'cyan' | 'indigo'
}) {
  const tones = {
    slate: 'border-slate-700/50 text-slate-100 bg-slate-800/60',
    amber: 'border-amber-500/20 text-amber-300 bg-amber-500/10',
    emerald: 'border-emerald-500/20 text-emerald-300 bg-emerald-500/10',
    red: 'border-red-500/20 text-red-300 bg-red-500/10',
    cyan: 'border-cyan-500/20 text-cyan-300 bg-cyan-500/10',
    indigo: 'border-indigo-500/20 text-indigo-300 bg-indigo-500/10',
  }

  return (
    <div className={`rounded-xl border p-5 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  )
}

export default function AdminSubmissions({ submissions, medDeclarations, sites }: Props) {
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites])

  const emergency = useMemo(() => {
    const newCount = submissions.filter(item => item.status === 'New').length
    const inReviewCount = submissions.filter(item => item.status === 'In Review').length
    const approvedCount = submissions.filter(item => item.status === 'Approved').length
    const followUpCount = submissions.filter(item => item.status === 'Requires Follow-up').length
    const actioned = submissions.filter(
      item => item.status === 'In Review' || item.status === 'Approved' || item.status === 'Requires Follow-up',
    )

    const monthlyCounts: Record<string, number> = {}
    for (const item of actioned) {
      const key = getMonthKey(item.submitted_at)
      monthlyCounts[key] = (monthlyCounts[key] ?? 0) + 1
    }

    const siteCounts: Record<string, number> = {}
    for (const item of actioned) {
      const key = item.site_id ? siteNameMap.get(item.site_id) ?? 'Unknown site' : 'Unknown site'
      siteCounts[key] = (siteCounts[key] ?? 0) + 1
    }

    return {
      newCount,
      inReviewCount,
      approvedCount,
      followUpCount,
      totalActioned: actioned.length,
      monthlyRows: Object.entries(monthlyCounts)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([label, value]) => ({ label: formatMonth(label), value })),
      siteRows: Object.entries(siteCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, value]) => ({ label, value })),
    }
  }, [siteNameMap, submissions])

  const medication = useMemo(() => {
    const pendingCount = medDeclarations.filter(
      item => !item.medic_review_status || item.medic_review_status === 'Pending',
    ).length
    const inReviewCount = medDeclarations.filter(item => item.medic_review_status === 'In Review').length
    const reviewedCount = medDeclarations.filter(
      item => item.medic_review_status === 'Normal Duties'
        || item.medic_review_status === 'Restricted Duties'
        || item.medic_review_status === 'Unfit for Work',
    ).length

    const monthlyCounts: Record<string, number> = {}
    for (const item of medDeclarations) {
      const key = getMonthKey(item.submitted_at)
      monthlyCounts[key] = (monthlyCounts[key] ?? 0) + 1
    }

    const siteCounts: Record<string, number> = {}
    for (const item of medDeclarations) {
      const key = item.site_id ? siteNameMap.get(item.site_id) ?? 'Unknown site' : 'Unknown site'
      siteCounts[key] = (siteCounts[key] ?? 0) + 1
    }

    return {
      pendingCount,
      inReviewCount,
      reviewedCount,
      totalVisible: medDeclarations.length,
      monthlyRows: Object.entries(monthlyCounts)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([label, value]) => ({ label: formatMonth(label), value })),
      siteRows: Object.entries(siteCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, value]) => ({ label, value })),
    }
  }, [medDeclarations, siteNameMap])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Submissions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Business-scoped oversight only. This page shows workflow counts and site trends without exposing declaration contents.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Emergency Declarations</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track safety review load, actioned volume, and site-level activity.</p>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <MetricCard title="Awaiting Review" value={emergency.newCount} tone="red" />
          <MetricCard title="In Review" value={emergency.inReviewCount} tone="amber" />
          <MetricCard title="Approved" value={emergency.approvedCount} tone="emerald" />
          <MetricCard title="Follow-Up" value={emergency.followUpCount} tone="cyan" />
          <MetricCard title="Total Actioned" value={emergency.totalActioned} tone="slate" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <BreakdownTable
            title="Monthly Breakdown"
            emptyLabel="No emergency declaration activity recorded yet."
            rows={emergency.monthlyRows}
            valueLabel="Actioned"
          />
          <BreakdownTable
            title="By Site"
            emptyLabel="No site activity recorded yet."
            rows={emergency.siteRows}
            valueLabel="Actioned"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Medication Declarations</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track pending medication reviews and overall declaration volume by month and site.</p>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard title="Pending" value={medication.pendingCount} tone="indigo" />
          <MetricCard title="In Review" value={medication.inReviewCount} tone="amber" />
          <MetricCard title="Reviewed" value={medication.reviewedCount} tone="emerald" />
          <MetricCard title="Total Visible" value={medication.totalVisible} tone="slate" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <BreakdownTable
            title="Monthly Breakdown"
            emptyLabel="No medication declaration activity recorded yet."
            rows={medication.monthlyRows}
            valueLabel="Declarations"
          />
          <BreakdownTable
            title="By Site"
            emptyLabel="No site activity recorded yet."
            rows={medication.siteRows}
            valueLabel="Declarations"
          />
        </div>
      </section>
    </div>
  )
}
