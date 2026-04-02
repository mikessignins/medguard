'use client'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { MonthlyBillableRow } from '@/lib/billing'

interface Business {
  id: string
  name: string
}

interface Props {
  businesses: Business[]
  monthlyBillables: MonthlyBillableRow[]
}

function formatMonth(monthDate: string) {
  try {
    return format(new Date(`${monthDate}T00:00:00.000Z`), 'MMMM yyyy')
  } catch {
    return monthDate
  }
}

function currentMonthDateUtc() {
  return format(new Date(), 'yyyy-MM-01')
}

export default function SuperuserBilling({ businesses, monthlyBillables }: Props) {
  const [selectedBiz, setSelectedBiz] = useState<string>('all')
  const currentMonth = currentMonthDateUtc()

  const bizNameById = useMemo(
    () => Object.fromEntries(businesses.map((biz) => [biz.id, biz.name])),
    [businesses],
  )

  const filteredRows = useMemo(
    () =>
      selectedBiz === 'all'
        ? monthlyBillables
        : monthlyBillables.filter((row) => row.business_id === selectedBiz),
    [monthlyBillables, selectedBiz],
  )

  const monthTotals = useMemo(() => {
    const byMonth: Record<string, number> = {}
    for (const row of filteredRows) {
      byMonth[row.bill_month] = (byMonth[row.bill_month] ?? 0) + row.billable_forms
    }
    return Object.entries(byMonth)
      .map(([bill_month, total]) => ({ bill_month, total }))
      .sort((a, b) => b.bill_month.localeCompare(a.bill_month))
  }, [filteredRows])

  const businessTotals = useMemo(() => {
    if (selectedBiz !== 'all') return []
    const byBusiness: Record<string, number> = {}
    for (const row of monthlyBillables) {
      byBusiness[row.business_id] = (byBusiness[row.business_id] ?? 0) + row.billable_forms
    }
    return Object.entries(byBusiness)
      .map(([businessId, total]) => ({
        businessId,
        name: bizNameById[businessId] ?? businessId,
        total,
      }))
      .sort((a, b) => b.total - a.total)
  }, [monthlyBillables, selectedBiz, bizNameById])

  const totalBillable = monthTotals.reduce((sum, row) => sum + row.total, 0)
  const thisMonthTotal = monthTotals.find((row) => row.bill_month === currentMonth)?.total ?? 0
  const isEmpty = totalBillable === 0

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-100">Billing Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">Source of truth: business_monthly_billables. One billing path for admin and superuser invoicing.</p>
      </div>

      <div className="mb-8">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Filter by Business</label>
        <select
          value={selectedBiz}
          onChange={(event) => setSelectedBiz(event.target.value)}
          className="w-full max-w-xs px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
        >
          <option value="all">All Businesses</option>
          {businesses.map((biz) => (
            <option key={biz.id} value={biz.id}>{biz.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">This Month</p>
          <p className="text-3xl font-bold text-cyan-400">{thisMonthTotal}</p>
        </div>

        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-5">
          <p className="text-xs font-semibold text-cyan-600 uppercase tracking-wide mb-2">Total Billable</p>
          <p className="text-3xl font-bold text-cyan-300">{totalBillable}</p>
          <p className="text-xs text-cyan-700 mt-1">All time</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Months with Activity</p>
          <p className="text-3xl font-bold text-slate-100">{monthTotals.length}</p>
        </div>
      </div>

      {isEmpty ? (
        <p className="text-center py-16 text-[var(--text-3)]">No billable submissions yet.</p>
      ) : (
        <div className="space-y-6">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Monthly Breakdown</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Billable Forms</th>
                </tr>
              </thead>
              <tbody>
                {monthTotals.map((row, i) => {
                  const isCurrentMonth = row.bill_month === currentMonth
                  return (
                    <tr key={row.bill_month} className={`${i > 0 ? 'border-t border-slate-700/50' : ''} ${isCurrentMonth ? 'bg-cyan-500/5' : ''}`}>
                      <td className="px-5 py-3 text-slate-300">
                        {formatMonth(row.bill_month)}
                        {isCurrentMonth && (
                          <span className="ml-2 text-xs text-cyan-600 font-medium">current</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-100">{row.total}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-600 bg-slate-800/40">
                  <td className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-cyan-400">{totalBillable}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {selectedBiz === 'all' && businessTotals.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">By Business — All Time</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Business</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Billable Forms</th>
                  </tr>
                </thead>
                <tbody>
                  {businessTotals.map((biz, i) => (
                    <tr key={biz.businessId} className={i > 0 ? 'border-t border-slate-700/50' : ''}>
                      <td className="px-5 py-3 text-slate-300">{biz.name}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-100">{biz.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
