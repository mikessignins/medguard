'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { Site, Submission, SubmissionStatus } from '@/lib/types'

const STATUS_ORDER: SubmissionStatus[] = ['New', 'In Review', 'Approved', 'Requires Follow-up']

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  'New': 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Approved': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Requires Follow-up': 'bg-red-500/10 text-red-400 border border-red-500/20',
}

const FLAGGED_REVIEWS = [
  'Opioid', 'Benzodiazepine', 'Antipsychotic', 'Anticoagulant',
  'Insulin / Diabetes', 'Antiepileptic', 'Sedative / Hypnotic', 'Stimulant', 'Review Required',
]

const AUTO_PURGE_DAYS = 7

function hasFlaggedMeds(sub: Submission): boolean {
  return (sub.worker_snapshot?.currentMedications || []).some(
    m => FLAGGED_REVIEWS.includes(m.reviewFlag)
  )
}

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

type FilterType = 'All' | SubmissionStatus | 'Exported'

interface Props {
  sites: Site[]
  submissions: Submission[]
}

export default function MedicDashboard({ sites, submissions }: Props) {
  const [activeTab, setActiveTab] = useState(sites[0]?.id || '')
  const [filter, setFilter] = useState<FilterType>('All')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [purging, setPurging] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [purgeError, setPurgeError] = useState('')
  const router = useRouter()
  const siteSubmissions = submissions.filter(s => s.site_id === activeTab)
  const newCount = siteSubmissions.filter(s => s.status === 'New' && !s.exported_at).length
  const exportedCount = siteSubmissions.filter(s => !!s.exported_at && !s.phi_purged_at).length

  const filtered: Submission[] = filter === 'Exported'
    ? siteSubmissions.filter(s => !!s.exported_at && !s.phi_purged_at)
    : filter === 'All'
      ? siteSubmissions.filter(s => !s.exported_at)
      : siteSubmissions.filter(s => s.status === filter && !s.exported_at)

  const grouped = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = filtered.filter(s => s.status === status)
    return acc
  }, {} as Record<SubmissionStatus, Submission[]>)

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSelectAll() {
    const purgeable = filtered.filter(s => !s.phi_purged_at)
    if (selectedIds.size === purgeable.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(purgeable.map(s => s.id)))
    }
  }

  async function handlePurge() {
    if (selectedIds.size === 0) return
    setPurging(true)
    setPurgeError('')
    try {
      const res = await fetch('/api/declarations/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const msg = await res.text()
        setPurgeError(`Purge failed: ${msg}`)
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

  if (sites.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg">No sites assigned to your account.</p>
        <p className="text-sm mt-1">Contact your administrator to be assigned to a site.</p>
      </div>
    )
  }

  const filterButtons: FilterType[] = ['All', ...STATUS_ORDER, 'Exported']
  const purgeable = filtered.filter(s => !s.phi_purged_at)

  // Stat counts for active site
  const statNew = siteSubmissions.filter(s => s.status === 'New' && !s.exported_at).length
  const statInReview = siteSubmissions.filter(s => s.status === 'In Review' && !s.exported_at).length
  const statApproved = siteSubmissions.filter(s => s.status === 'Approved' && !s.exported_at).length
  const statFollowUp = siteSubmissions.filter(s => s.status === 'Requires Follow-up' && !s.exported_at).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Submissions</h1>
        <p className="text-sm text-slate-500 mt-0.5">Review fitness-for-work declarations</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">New</p>
          <p className="text-2xl font-bold text-indigo-400">{statNew}</p>
        </div>
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">In Review</p>
          <p className="text-2xl font-bold text-amber-400">{statInReview}</p>
        </div>
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Approved</p>
          <p className="text-2xl font-bold text-emerald-400">{statApproved}</p>
        </div>
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Follow-up</p>
          <p className="text-2xl font-bold text-red-400">{statFollowUp}</p>
        </div>
      </div>

      {/* New submissions alert */}
      {newCount > 0 && (
        <div className="mb-5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span><strong>{newCount} submission{newCount !== 1 ? 's' : ''}</strong> awaiting review on this site.</span>
        </div>
      )}

      {/* Site Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-800 overflow-x-auto">
        {sites.map(site => {
          const siteNew = submissions.filter(s => s.site_id === site.id && s.status === 'New' && !s.exported_at).length
          return (
            <button
              key={site.id}
              onClick={() => { setActiveTab(site.id); setFilter('All'); setSelectedIds(new Set()) }}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === site.id
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {site.name}
              {site.is_office && <span className="text-xs text-slate-600">(Office)</span>}
              {siteNew > 0 && (
                <span className="text-xs bg-cyan-600 text-white px-1.5 py-0.5 rounded-full font-semibold">
                  {siteNew}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filterButtons.map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setSelectedIds(new Set()); setConfirmPurge(false) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              filter === f
                ? f === 'Exported'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
            {f}
            {f === 'Exported' ? (
              exportedCount > 0 && (
                <span className="ml-1 opacity-70">({exportedCount})</span>
              )
            ) : f !== 'All' ? (
              <span className="ml-1 opacity-70">
                ({siteSubmissions.filter(x => x.status === f && !x.exported_at).length})
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Exported tab — multi-select toolbar */}
      {filter === 'Exported' && purgeable.length > 0 && (
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
            <p className="text-xs text-slate-500">
              PHI auto-purges {AUTO_PURGE_DAYS} days after export
            </p>
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

      {purgeError && (
        <p className="text-sm text-red-400 mt-2">{purgeError}</p>
      )}

      {/* Submission list */}
      {filter === 'Exported' ? (
        <div>
          {filtered.length === 0 ? (
            <p className="text-center py-12 text-slate-600">No exported declarations.</p>
          ) : (
            <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
              {filtered.map((sub, i) => {
                const isPurged = !!sub.phi_purged_at
                const canSelect = !isPurged
                const isSelected = selectedIds.has(sub.id)
                return (
                  <div
                    key={sub.id}
                    className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''} ${isPurged ? 'opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!canSelect}
                      onChange={() => canSelect && toggleSelect(sub.id)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={() => router.push(`/medic/submissions/${sub.id}`)}
                      className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-100">
                            {sub.worker_snapshot?.fullName || (isPurged ? 'PHI Purged' : 'Unknown Worker')}
                          </p>
                          {hasFlaggedMeds(sub) && (
                            <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" title="Flagged medications" />
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {(() => { try { return sub.visit_date ? format(new Date(sub.visit_date), 'dd MMM yyyy') : 'No date' } catch { return 'No date' } })()}
                          {' '}&middot;{' '}{sub.shift_type || 'N/A'}
                          {' '}&middot;{' '}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[sub.status as SubmissionStatus] || 'bg-slate-700 text-slate-400 border border-slate-600'}`}>
                            {sub.status}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {isPurged ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">
                            Purged
                          </span>
                        ) : sub.exported_at ? (
                          <PurgeCountdown exportedAt={sub.exported_at} />
                        ) : null}
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {STATUS_ORDER.map(status => {
            const items = grouped[status]
            if (!items || items.length === 0) return null
            return (
              <div key={status}>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  {status} <span className="font-normal">({items.length})</span>
                </h2>
                <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
                  {items.map((sub, i) => (
                    <button
                      key={sub.id}
                      onClick={() => router.push(`/medic/submissions/${sub.id}`)}
                      className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-100">
                              {sub.worker_snapshot?.fullName || 'Unknown Worker'}
                            </p>
                            {hasFlaggedMeds(sub) && (
                              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" title="Flagged medications" />
                            )}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {(() => { try { return sub.visit_date ? format(new Date(sub.visit_date), 'dd MMM yyyy') : 'No date' } catch { return 'No date' } })()} &middot; <span className="text-slate-500">{sub.shift_type || 'N/A'}</span>
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[status]} shrink-0`}>
                        {status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-center py-12 text-slate-600">
              {filter === 'All' ? 'No submissions for this site.' : `No submissions with status "${filter}".`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
