'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'

interface SiteItem {
  id: string
  name: string
}

interface BreakdownRow {
  label: string
  value: number
}

interface SubmissionOverview {
  emergency: {
    newCount: number
    inReviewCount: number
    approvedCount: number
    followUpCount: number
    totalActioned: number
    monthlyRows: BreakdownRow[]
    siteRows: BreakdownRow[]
  }
  medication: {
    pendingCount: number
    inReviewCount: number
    reviewedCount: number
    totalVisible: number
    monthlyRows: BreakdownRow[]
    siteRows: BreakdownRow[]
  }
}

interface Props {
  overview: SubmissionOverview
  sites: SiteItem[]
}

function TrendChart({
  title,
  rows,
  lineClassName,
  fillClassName,
}: {
  title: string
  rows: Array<{ label: string; value: number }>
  lineClassName: string
  fillClassName: string
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h3>
        <p className="mt-4 text-sm text-slate-500">No trend data available yet.</p>
      </div>
    )
  }

  const width = 520
  const height = 180
  const paddingX = 22
  const paddingY = 18
  const values = rows.map((row) => row.value)
  const maxValue = Math.max(...values, 1)
  const stepX = rows.length > 1 ? (width - paddingX * 2) / (rows.length - 1) : 0

  const points = rows.map((row, index) => {
    const x = paddingX + stepX * index
    const normalized = row.value / maxValue
    const y = height - paddingY - normalized * (height - paddingY * 2)
    return { ...row, x, y }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const fillPath = `${linePath} L ${points[points.length - 1]?.x ?? paddingX} ${height - paddingY} L ${points[0]?.x ?? paddingX} ${height - paddingY} Z`

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h3>
        <p className="text-xs text-slate-500">Last {rows.length} months</p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 h-44 w-full overflow-visible"
        role="img"
        aria-label={title}
      >
        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = height - paddingY - fraction * (height - paddingY * 2)
          return (
            <line
              key={fraction}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              className="stroke-slate-700/60"
              strokeWidth="1"
            />
          )
        })}
        <path d={fillPath} className={fillClassName} />
        <path d={linePath} className={lineClassName} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4" className="fill-slate-950 stroke-slate-200/80" strokeWidth="1.5" />
            <text x={point.x} y={point.y - 10} textAnchor="middle" className="fill-slate-300 text-[10px] font-medium">
              {point.value}
            </text>
            <text x={point.x} y={height} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
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

export default function AdminSubmissions({ overview, sites }: Props) {
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites])

  const emergency = useMemo(() => ({
    ...overview.emergency,
    monthlyRows: overview.emergency.monthlyRows.map((row) => ({ ...row, label: formatMonth(row.label) })),
    siteRows: overview.emergency.siteRows.map((row) => ({
      ...row,
      label: row.label ? siteNameMap.get(row.label) ?? 'Unknown site' : 'Unknown site',
    })),
  }), [overview.emergency, siteNameMap])

  const medication = useMemo(() => ({
    ...overview.medication,
    monthlyRows: overview.medication.monthlyRows.map((row) => ({ ...row, label: formatMonth(row.label) })),
    siteRows: overview.medication.siteRows.map((row) => ({
      ...row,
      label: row.label ? siteNameMap.get(row.label) ?? 'Unknown site' : 'Unknown site',
    })),
  }), [overview.medication, siteNameMap])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Submissions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Business-scoped oversight only. This page shows workflow counts and site trends without exposing declaration contents.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          The overview card for <span className="font-medium text-slate-300">Unreviewed &gt;24h</span> combines both <span className="font-medium text-slate-300">Awaiting Review</span> and <span className="font-medium text-slate-300">In Review</span> items that are still unresolved after 24 hours.
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
          <TrendChart
            title="Emergency Trend"
            rows={emergency.monthlyRows}
            lineClassName="stroke-cyan-300"
            fillClassName="fill-cyan-500/10"
          />
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
          <TrendChart
            title="Medication Trend"
            rows={medication.monthlyRows}
            lineClassName="stroke-indigo-300"
            fillClassName="fill-indigo-500/10"
          />
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
