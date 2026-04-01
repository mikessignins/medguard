'use client'
import { useMemo } from 'react'
import { format } from 'date-fns'

interface Submission {
  submitted_at: string
  status: string
}

interface MedDec {
  submitted_at: string
  medic_review_status: string
}

interface Props {
  submissions: Submission[]
  medDeclarations: MedDec[]
}

function getMonthKey(dateStr: string) {
  try { return format(new Date(dateStr), 'yyyy-MM') } catch { return 'Unknown' }
}

function formatMonth(key: string) {
  try {
    const [year, month] = key.split('-')
    return format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMMM yyyy')
  } catch { return key }
}

export default function AdminBilling({ submissions, medDeclarations }: Props) {
  const currentMonthKey = format(new Date(), 'yyyy-MM')

  const { subMonths, medMonths, allMonthKeys } = useMemo(() => {
    const subMonths: Record<string, number> = {}
    for (const s of submissions) {
      const key = getMonthKey(s.submitted_at)
      subMonths[key] = (subMonths[key] ?? 0) + 1
    }
    const medMonths: Record<string, number> = {}
    for (const m of medDeclarations) {
      const key = getMonthKey(m.submitted_at)
      medMonths[key] = (medMonths[key] ?? 0) + 1
    }
    const combined = Object.keys(subMonths).concat(Object.keys(medMonths))
    const allMonthKeys = combined.filter((k, i) => combined.indexOf(k) === i).sort((a, b) => b.localeCompare(a))
    return { subMonths, medMonths, allMonthKeys }
  }, [submissions, medDeclarations])

  const totalSubs = submissions.length
  const totalMeds = medDeclarations.length
  const totalBillable = totalSubs + totalMeds

  const thisMonthSubs = subMonths[currentMonthKey] ?? 0
  const thisMonthMeds = medMonths[currentMonthKey] ?? 0
  const thisMonthTotal = thisMonthSubs + thisMonthMeds

  const isEmpty = totalBillable === 0

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-100">Billing Summary</h1>
        <p className="text-sm text-slate-500 mt-0.5">Billable totals include all non-test emergency declarations except recalled forms, plus all non-test medication declarations. Purging never changes billing counts.</p>
      </div>

      {/* Hero stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">This Month</p>
          <p className="text-3xl font-bold text-cyan-400">{thisMonthTotal}</p>
          <p className="text-xs text-slate-600 mt-1">{thisMonthSubs} decl · {thisMonthMeds} med dec</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Medical Information</p>
          <p className="text-3xl font-bold text-slate-100">{totalSubs}</p>
          <p className="text-xs text-slate-600 mt-1">All time</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Medication Declarations</p>
          <p className="text-3xl font-bold text-slate-100">{totalMeds}</p>
          <p className="text-xs text-slate-600 mt-1">All time</p>
        </div>

        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-5">
          <p className="text-xs font-semibold text-cyan-600 uppercase tracking-wide mb-2">Total Billable</p>
          <p className="text-3xl font-bold text-cyan-300">{totalBillable}</p>
          <p className="text-xs text-cyan-700 mt-1">All time</p>
        </div>
      </div>

      {/* Monthly breakdown */}
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
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Medical Info</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Med. Decl.</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {allMonthKeys.map((key, i) => {
                const subs = subMonths[key] ?? 0
                const meds = medMonths[key] ?? 0
                const total = subs + meds
                const isCurrentMonth = key === currentMonthKey
                return (
                  <tr
                    key={key}
                    className={`${i > 0 ? 'border-t border-slate-700/50' : ''} ${isCurrentMonth ? 'bg-cyan-500/5' : ''}`}
                  >
                    <td className="px-5 py-3 text-slate-300">
                      {formatMonth(key)}
                      {isCurrentMonth && (
                        <span className="ml-2 text-xs text-cyan-600 font-medium">current</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-300">{subs}</td>
                    <td className="px-5 py-3 text-right font-mono text-slate-300">{meds}</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-slate-100">{total}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-600 bg-slate-800/40">
                <td className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</td>
                <td className="px-5 py-3 text-right font-mono font-bold text-slate-200">{totalSubs}</td>
                <td className="px-5 py-3 text-right font-mono font-bold text-slate-200">{totalMeds}</td>
                <td className="px-5 py-3 text-right font-mono font-bold text-cyan-400">{totalBillable}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
