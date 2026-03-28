'use client'
import { useState, useMemo } from 'react'
import { format } from 'date-fns'

interface Submission {
  business_id: string
  submitted_at: string
  status: string
}

interface MedDec {
  business_id: string
  submitted_at: string
  medic_review_status: string
}

interface Business {
  id: string
  name: string
}

interface Props {
  businesses: Business[]
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

export default function SuperuserBilling({ businesses, submissions, medDeclarations }: Props) {
  const [selectedBiz, setSelectedBiz] = useState<string>('all')

  const bizMap = useMemo(
    () => Object.fromEntries(businesses.map(b => [b.id, b.name])),
    [businesses]
  )

  const filteredSubs = useMemo(() =>
    selectedBiz === 'all' ? submissions : submissions.filter(s => s.business_id === selectedBiz),
    [submissions, selectedBiz]
  )

  const filteredMeds = useMemo(() =>
    selectedBiz === 'all' ? medDeclarations : medDeclarations.filter(m => m.business_id === selectedBiz),
    [medDeclarations, selectedBiz]
  )

  const hasMedDecs = medDeclarations.length > 0
  const currentMonthKey = format(new Date(), 'yyyy-MM')

  const { subMonths, medMonths, allMonthKeys } = useMemo(() => {
    const subMonths: Record<string, number> = {}
    for (const s of filteredSubs) {
      const key = getMonthKey(s.submitted_at)
      subMonths[key] = (subMonths[key] ?? 0) + 1
    }
    const medMonths: Record<string, number> = {}
    for (const m of filteredMeds) {
      const key = getMonthKey(m.submitted_at)
      medMonths[key] = (medMonths[key] ?? 0) + 1
    }
    const combined = Object.keys(subMonths).concat(Object.keys(medMonths))
    const allMonthKeys = combined.filter((k, i) => combined.indexOf(k) === i).sort((a, b) => b.localeCompare(a))
    return { subMonths, medMonths, allMonthKeys }
  }, [filteredSubs, filteredMeds])

  // Per-business combined totals for the 'all' view
  const bizTotals = useMemo(() => {
    if (selectedBiz !== 'all') return []
    const subTotals: Record<string, number> = {}
    for (const s of submissions) subTotals[s.business_id] = (subTotals[s.business_id] ?? 0) + 1
    const medTotals: Record<string, number> = {}
    for (const m of medDeclarations) medTotals[m.business_id] = (medTotals[m.business_id] ?? 0) + 1
    const combinedBiz = Object.keys(subTotals).concat(Object.keys(medTotals))
    const allBizIds = combinedBiz.filter((k, i) => combinedBiz.indexOf(k) === i)
    return allBizIds
      .map(bizId => ({
        bizId,
        name: bizMap[bizId] ?? bizId,
        subs: subTotals[bizId] ?? 0,
        meds: medTotals[bizId] ?? 0,
        total: (subTotals[bizId] ?? 0) + (medTotals[bizId] ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [submissions, medDeclarations, selectedBiz, bizMap])

  const totalSubs = filteredSubs.length
  const totalMeds = filteredMeds.length
  const totalBillable = totalSubs + totalMeds
  const thisMonthSubs = subMonths[currentMonthKey] ?? 0
  const thisMonthMeds = medMonths[currentMonthKey] ?? 0
  const thisMonthTotal = thisMonthSubs + thisMonthMeds

  const isEmpty = totalBillable === 0

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-100">Billing Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">All reviewed forms across all businesses — counts update in real time.</p>
      </div>

      {/* Business selector */}
      <div className="mb-8">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Filter by Business</label>
        <select
          value={selectedBiz}
          onChange={e => setSelectedBiz(e.target.value)}
          className="w-full max-w-xs px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
        >
          <option value="all">All Businesses</option>
          {businesses.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Hero stat cards */}
      <div className={`grid gap-4 mb-8 ${hasMedDecs ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">This Month</p>
          <p className="text-3xl font-bold text-cyan-400">{thisMonthTotal}</p>
          {hasMedDecs && (
            <p className="text-xs text-slate-600 mt-1">{thisMonthSubs} decl · {thisMonthMeds} med dec</p>
          )}
        </div>

        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Emergency Declarations</p>
          <p className="text-3xl font-bold text-slate-100">{totalSubs}</p>
          <p className="text-xs text-slate-600 mt-1">All time</p>
        </div>

        {hasMedDecs && (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Medication Declarations</p>
            <p className="text-3xl font-bold text-slate-100">{totalMeds}</p>
            <p className="text-xs text-slate-600 mt-1">All time</p>
          </div>
        )}

        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-5">
          <p className="text-xs font-semibold text-cyan-600 uppercase tracking-wide mb-2">Total Billable</p>
          <p className="text-3xl font-bold text-cyan-300">{totalBillable}</p>
          <p className="text-xs text-cyan-700 mt-1">All time</p>
        </div>
      </div>

      {isEmpty ? (
        <p className="text-center py-16 text-slate-600">No billable submissions yet.</p>
      ) : (
        <div className="space-y-6">
          {/* Monthly breakdown */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Monthly Breakdown</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Emergency Decl.</th>
                  {hasMedDecs && (
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Med. Decl.</th>
                  )}
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
                    <tr key={key} className={`${i > 0 ? 'border-t border-slate-700/50' : ''} ${isCurrentMonth ? 'bg-cyan-500/5' : ''}`}>
                      <td className="px-5 py-3 text-slate-300">
                        {formatMonth(key)}
                        {isCurrentMonth && (
                          <span className="ml-2 text-xs text-cyan-600 font-medium">current</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-300">{subs}</td>
                      {hasMedDecs && (
                        <td className="px-5 py-3 text-right font-mono text-slate-300">{meds}</td>
                      )}
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-100">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-600 bg-slate-800/40">
                  <td className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-slate-200">{totalSubs}</td>
                  {hasMedDecs && (
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-200">{totalMeds}</td>
                  )}
                  <td className="px-5 py-3 text-right font-mono font-bold text-cyan-400">{totalBillable}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Per-business breakdown (all view only) */}
          {selectedBiz === 'all' && bizTotals.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">By Business — All Time</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Business</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Emergency Decl.</th>
                    {hasMedDecs && (
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Med. Decl.</th>
                    )}
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bizTotals.map(({ bizId, name, subs, meds, total }, i) => (
                    <tr key={bizId} className={i > 0 ? 'border-t border-slate-700/50' : ''}>
                      <td className="px-5 py-3 text-slate-300">{name}</td>
                      <td className="px-5 py-3 text-right font-mono text-slate-300">{subs}</td>
                      {hasMedDecs && (
                        <td className="px-5 py-3 text-right font-mono text-slate-300">{meds}</td>
                      )}
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-100">{total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-600 bg-slate-800/40">
                    <td className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-200">{submissions.length}</td>
                    {hasMedDecs && (
                      <td className="px-5 py-3 text-right font-mono font-bold text-slate-200">{medDeclarations.length}</td>
                    )}
                    <td className="px-5 py-3 text-right font-mono font-bold text-cyan-400">{submissions.length + medDeclarations.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
