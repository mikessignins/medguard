'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { MedicationDeclaration, MedDecReviewStatus } from '@/lib/types'

const STATUS_COLORS: Record<MedDecReviewStatus, string> = {
  'Pending':          'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  'In Review':        'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Normal Duties':    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Restricted Duties': 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  'Unfit for Work':   'bg-red-500/10 text-red-400 border border-red-500/20',
}

const AUTO_PURGE_DAYS = 7

function daysUntilPurge(exportedAt: string): number {
  const purgeDate = new Date(new Date(exportedAt).getTime() + AUTO_PURGE_DAYS * 86400000)
  return Math.ceil((purgeDate.getTime() - Date.now()) / 86400000)
}

function PurgeCountdown({ exportedAt }: { exportedAt: string }) {
  const days = daysUntilPurge(exportedAt)
  if (days <= 0) return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
      Auto-purging
    </span>
  )
  const color = days <= 1
    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
    : days <= 3
    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
    : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      Purges in {days}d
    </span>
  )
}

interface Props {
  medDeclarations: MedicationDeclaration[]
  siteId: string
}

export default function MedDecSection({ medDeclarations, siteId }: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [purging, setPurging] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [purgeError, setPurgeError] = useState('')
  const [showExported, setShowExported] = useState(false)

  const FINAL_STATUSES = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']

  const siteDecs = medDeclarations.filter(m => m.site_id === siteId)
  // Awaiting review: not yet exported, no final outcome
  const active = siteDecs.filter(m => !m.exported_at && !m.phi_purged_at && !FINAL_STATUSES.includes(m.medic_review_status))
  // Reviewed but not yet exported (ready to export/purge)
  const reviewed = siteDecs.filter(m => !m.exported_at && !m.phi_purged_at && FINAL_STATUSES.includes(m.medic_review_status))
  const exported = siteDecs.filter(m => !!m.exported_at && !m.phi_purged_at)
  const purged = siteDecs.filter(m => !!m.phi_purged_at)
  const purgeable = [...reviewed, ...exported].filter(m => !m.phi_purged_at)

  const pendingCount = active.filter(m => !m.medic_review_status || m.medic_review_status === 'Pending' || m.medic_review_status === 'In Review').length

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === purgeable.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(purgeable.map(m => m.id)))
    }
  }

  async function handlePurge() {
    if (selectedIds.size === 0) return
    setPurging(true)
    setPurgeError('')
    try {
      const res = await fetch('/api/medication-declarations/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setPurgeError(data.error || 'Purge failed')
        setPurging(false)
        return
      }
    } catch {
      setPurgeError('Network error — please try again.')
      setPurging(false)
      return
    }
    setSelectedIds(new Set())
    setConfirmPurge(false)
    setPurging(false)
    router.refresh()
  }

  if (siteDecs.length === 0) return null

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Medication Declarations</h2>
        {pendingCount > 0 && (
          <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-semibold shrink-0">
            {pendingCount} pending
          </span>
        )}
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* Active (not yet exported) */}
      {active.length > 0 && (
        <div className="space-y-2 mb-6">
          {active.map((m) => {
            const hasSideEffects = m.has_side_effects || m.has_recent_injury_or_illness
            return (
              <button
                key={m.id}
                onClick={() => router.push(`/medic/med-declarations/${m.id}`)}
                className="w-full text-left bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl px-5 py-4 hover:border-slate-600 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-slate-100">
                      {m.phi_purged_at ? 'PHI Purged' : m.worker_name || 'Unknown Worker'}
                    </p>
                    {hasSideEffects && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Health flags" />
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) !== 1 ? 's' : ''}
                    {' '}&middot;{' '}
                    {(() => { try { return format(new Date(m.submitted_at), 'dd MMM yyyy') } catch { return '' } })()}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[m.medic_review_status as MedDecReviewStatus] || STATUS_COLORS['Pending']}`}>
                  {m.medic_review_status || 'Pending'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Reviewed section — final outcome set, ready to export */}
      {reviewed.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Reviewed — Awaiting Export</p>
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
            {reviewed.map((m, i) => {
              const hasSideEffects = m.has_side_effects || m.has_recent_injury_or_illness
              return (
                <button
                  key={m.id}
                  onClick={() => router.push(`/medic/med-declarations/${m.id}`)}
                  className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-100">{m.worker_name || 'Unknown Worker'}</p>
                      {hasSideEffects && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Health flags" />
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) !== 1 ? 's' : ''}
                      {' '}&middot;{' '}
                      {(() => { try { return format(new Date(m.submitted_at), 'dd MMM yyyy') } catch { return '' } })()}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[m.medic_review_status as MedDecReviewStatus] || STATUS_COLORS['Pending']}`}>
                    {m.medic_review_status}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Exported section */}
      {(exported.length > 0 || purged.length > 0) && (
        <div>
          <button
            onClick={() => setShowExported(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors mb-3"
          >
            <svg className={`w-4 h-4 transition-transform ${showExported ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Exported ({exported.length + purged.length})
          </button>

          {showExported && (
            <>
              {/* Purge toolbar */}
              {purgeable.length > 0 && (
                <div className="mb-4 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleSelectAll}
                      className="text-sm text-purple-400 font-medium hover:underline"
                    >
                      {selectedIds.size === purgeable.length ? 'Deselect all' : 'Select all'}
                    </button>
                    {selectedIds.size > 0 && (
                      <span className="text-sm text-slate-400">{selectedIds.size} selected</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500">PHI auto-purges {AUTO_PURGE_DAYS} days after export</p>
                    {selectedIds.size > 0 && !confirmPurge && (
                      <button
                        onClick={() => setConfirmPurge(true)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Purge selected ({selectedIds.size})
                      </button>
                    )}
                    {confirmPurge && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-red-400">Remove all PHI? Cannot be undone.</span>
                        <button
                          onClick={handlePurge}
                          disabled={purging}
                          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          {purging ? 'Purging...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmPurge(false)}
                          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {purgeError && <p className="text-sm text-red-400 mb-3">{purgeError}</p>}

              <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
                {[...exported, ...purged].map((m, i) => {
                  const isPurged = !!m.phi_purged_at
                  const isSelected = selectedIds.has(m.id)
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''} ${isPurged ? 'opacity-40' : ''}`}
                    >
                      {!isPurged && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(m.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer"
                        />
                      )}
                      <button
                        onClick={() => router.push(`/medic/med-declarations/${m.id}`)}
                        className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-slate-100">
                            {isPurged ? 'PHI Purged' : m.worker_name || 'Unknown'}
                          </p>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {(() => { try { return format(new Date(m.submitted_at), 'dd MMM yyyy') } catch { return '' } })()}
                            {' '}&middot;{' '}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[m.medic_review_status as MedDecReviewStatus] || STATUS_COLORS['Pending']}`}>
                              {m.medic_review_status || 'Pending'}
                            </span>
                          </p>
                        </div>
                        <div className="shrink-0 ml-3">
                          {isPurged ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">Purged</span>
                          ) : m.exported_at ? (
                            <PurgeCountdown exportedAt={m.exported_at} />
                          ) : null}
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {active.length === 0 && exported.length === 0 && purged.length === 0 && (
        <p className="text-center py-8 text-slate-600">No medication declarations for this site.</p>
      )}
    </div>
  )
}
