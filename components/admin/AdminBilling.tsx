'use client'
import { useMemo } from 'react'
import { format } from 'date-fns'
import type { MonthlyBillableRow } from '@/lib/billing'

interface Props {
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

export default function AdminBilling({ monthlyBillables }: Props) {
  const currentMonth = currentMonthDateUtc()

  const { thisMonthTotal, totalBillable, monthRows } = useMemo(() => {
    const rows = [...monthlyBillables].sort((a, b) => b.bill_month.localeCompare(a.bill_month))
    const total = rows.reduce((sum, row) => sum + row.billable_forms, 0)
    const thisMonth = rows.find((row) => row.bill_month === currentMonth)?.billable_forms ?? 0
    return { thisMonthTotal: thisMonth, totalBillable: total, monthRows: rows }
  }, [monthlyBillables, currentMonth])

  const isEmpty = totalBillable === 0

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-100">Billing Summary</h1>
        <p className="text-sm text-slate-500 mt-0.5">Source of truth: business_monthly_billables (non-test emergency declarations excluding recalled forms, plus non-test medication declarations).</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-3">
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
          <p className="text-3xl font-bold text-slate-100">{monthRows.length}</p>
        </div>
      </div>

      {isEmpty ? (
        <p className="text-center py-16 text-slate-600">No billable submissions yet.</p>
      ) : (
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
              {monthRows.map((row, i) => {
                const isCurrentMonth = row.bill_month === currentMonth
                return (
                  <tr
                    key={row.bill_month}
                    className={`${i > 0 ? 'border-t border-slate-700/50' : ''} ${isCurrentMonth ? 'bg-cyan-500/5' : ''}`}
                  >
                    <td className="px-5 py-3 text-slate-300">
                      {formatMonth(row.bill_month)}
                      {isCurrentMonth && (
                        <span className="ml-2 text-xs text-cyan-600 font-medium">current</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-slate-100">{row.billable_forms}</td>
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
      )}
    </div>
  )
}
