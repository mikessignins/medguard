'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { Site, Submission, SubmissionStatus, MedicationDeclaration } from '@/lib/types'
import MedDecSection from '@/components/medic/MedDecSection'

const STATUS_ORDER: SubmissionStatus[] = ['New', 'In Review', 'Approved', 'Requires Follow-up']

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  'New': 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Approved': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Requires Follow-up': 'bg-red-500/10 text-red-400 border border-red-500/20',
  'Recalled': 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
}

const FLAGGED_REVIEWS = [
  'Opioid', 'Benzodiazepine', 'Antipsychotic', 'Anticoagulant',
  'Insulin / Diabetes', 'Antiepileptic', 'Sedative / Hypnotic', 'Stimulant', 'Review Required',
]

const AUTO_PURGE_DAYS = 7

const MEDDEC_FINAL = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']

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

type FilterType = 'All' | SubmissionStatus

interface Props {
  sites: Site[]
  submissions: Submission[]
  medDeclarations: MedicationDeclaration[]
  medDecEnabled: boolean
}

export default function MedicDashboard({ sites, submissions, medDeclarations, medDecEnabled }: Props) {
  const [activeTab, setActiveTab] = useState(sites[0]?.id || '')
  const [filter, setFilter] = useState<FilterType>('All')
  const [activeSection, setActiveSection] = useState<'declarations' | 'meddec'>('declarations')
  const [showExported, setShowExported] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [purging, setPurging] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [purgeError, setPurgeError] = useState('')
  const router = useRouter()

  // Auto-refresh when a worker recalls a submission from iOS
  useEffect(() => {
    const supabase = createClient()
    const siteIds = sites.map(s => s.id)
    if (siteIds.length === 0) return

    const channel = supabase
      .channel('medic-submissions-watch')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'submissions',
      }, (payload) => {
        const updated = payload.new as { site_id?: string; status?: string }
        if (siteIds.includes(updated.site_id ?? '') && updated.status === 'Recalled') {
          router.refresh()
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sites, router])

  // Recalled submissions are hidden from the medic dashboard entirely
  const siteSubmissions = submissions.filter(s => s.site_id === activeTab && s.status !== 'Recalled')
  const newCount = siteSubmissions.filter(s => s.status === 'New' && !s.exported_at).length
  const pendingMedDecCount = medDecEnabled
    ? medDeclarations.filter(m =>
        m.site_id === activeTab &&
        !m.exported_at && !m.phi_purged_at &&
        !MEDDEC_FINAL.includes(m.medic_review_status)
      ).length
    : 0

  const filtered: Submission[] = filter === 'All'
    ? siteSubmissions.filter(s => !s.exported_at)
    : siteSubmissions.filter(s => s.status === filter && !s.exported_at)

  const exportedSubs = siteSubmissions.filter(s => !!s.exported_at && !s.phi_purged_at)
  const purgedSubs = siteSubmissions.filter(s => !!s.phi_purged_at)

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
    if (selectedIds.size === exportedSubs.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(exportedSubs.map(s => s.id)))
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

  // Stat counts for active site
  const statNew = siteSubmissions.filter(s => s.status === 'New' && !s.exported_at).length
  const statInReview = siteSubmissions.filter(s => s.status === 'In Review' && !s.exported_at).length
  const statApproved = siteSubmissions.filter(s => s.status === 'Approved' && !s.exported_at).length
  const statFollowUp = siteSubmissions.filter(s => s.status === 'Requires Follow-up' && !s.exported_at).length

  return (
    <div>

      {/* Stat cards — clickable filters */}
      <div className={`grid grid-cols-2 gap-3 mb-4 ${medDecEnabled ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {([
          { label: 'New', status: 'New' as FilterType, value: statNew, color: 'text-indigo-400', active: 'bg-indigo-500/15 border-indigo-500/40' },
          { label: 'In Review', status: 'In Review' as FilterType, value: statInReview, color: 'text-amber-400', active: 'bg-amber-500/15 border-amber-500/40' },
          { label: 'Approved', status: 'Approved' as FilterType, value: statApproved, color: 'text-emerald-400', active: 'bg-emerald-500/15 border-emerald-500/40' },
          { label: 'Follow-up', status: 'Requires Follow-up' as FilterType, value: statFollowUp, color: 'text-red-400', active: 'bg-red-500/15 border-red-500/40' },
        ] as const).map(card => (
          <button
            key={card.status}
            onClick={() => setFilter(f => f === card.status ? 'All' : card.status)}
            aria-pressed={filter === card.status}
            className={`text-left p-4 rounded-xl border transition-all duration-150 ${
              filter === card.status
                ? card.active
                : 'bg-slate-800/60 border-slate-700/50 hover:border-slate-600/60'
            }`}
          >
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </button>
        ))}
        {medDecEnabled && (
          <button
            onClick={() => setActiveSection('meddec')}
            aria-pressed={activeSection === 'meddec'}
            className={`text-left p-4 rounded-xl border transition-all duration-150 ${
              activeSection === 'meddec'
                ? 'bg-indigo-500/15 border-indigo-500/40'
                : 'bg-slate-800/60 border-slate-700/50 hover:border-slate-600/60'
            }`}
          >
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Med Decs</p>
            <p className="text-2xl font-bold text-violet-400">{pendingMedDecCount}</p>
            <p className="text-xs text-slate-600 mt-0.5">pending</p>
          </button>
        )}
      </div>

      {/* New submissions alert */}
      {newCount > 0 && (
        <div className="mb-5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span><strong>{newCount} emergency medical declaration{newCount !== 1 ? 's' : ''}</strong> awaiting review on this site.</span>
        </div>
      )}

      {/* Pending med dec alert */}
      {pendingMedDecCount > 0 && (
        <div className="mb-5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span><strong>{pendingMedDecCount} medication declaration{pendingMedDecCount !== 1 ? 's' : ''}</strong> pending review on this site.</span>
        </div>
      )}

      {/* Site switcher — scrollable pills */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {sites.map(site => {
          const siteNew = submissions.filter(s => s.site_id === site.id && s.status === 'New' && !s.exported_at).length
          const siteMedDecPending = medDecEnabled
            ? medDeclarations.filter(m =>
                m.site_id === site.id && !m.exported_at && !m.phi_purged_at &&
                !MEDDEC_FINAL.includes(m.medic_review_status)
              ).length
            : 0
          const isActive = activeTab === site.id
          return (
            <button
              key={site.id}
              onClick={() => { setActiveTab(site.id); setFilter('All'); setSelectedIds(new Set()); setConfirmPurge(false); setActiveSection('declarations') }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all duration-150 shrink-0 ${
                isActive
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {site.name}
              {site.is_office && <span className="text-xs text-slate-600">(Office)</span>}
              {siteNew > 0 && (
                <span className="bg-cyan-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">{siteNew}</span>
              )}
              {siteMedDecPending > 0 && (
                <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">{siteMedDecPending}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Section title */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Emergency Medical Declarations</h2>
        <div className="flex-1 h-px bg-slate-800" />
      </div>


      {purgeError && (
        <p className="text-sm text-red-400 mb-3">{purgeError}</p>
      )}

      {/* Active submission list */}
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

      {/* Exported section — collapsed by default */}
      {(exportedSubs.length > 0 || purgedSubs.length > 0) && (
        <div className="mt-6">
          <button
            onClick={() => setShowExported(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors mb-3"
          >
            <svg className={`w-4 h-4 transition-transform ${showExported ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Exported ({exportedSubs.length + purgedSubs.length})
          </button>

          {showExported && (
            <>
              {/* Purge toolbar */}
              {exportedSubs.length > 0 && (
                <div className="mb-4 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleSelectAll}
                      className="text-sm text-purple-400 font-medium hover:underline"
                    >
                      {selectedIds.size === exportedSubs.length ? 'Deselect all' : 'Select all'}
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

              <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
                {[...exportedSubs, ...purgedSubs].map((sub, i) => {
                  const isPurged = !!sub.phi_purged_at
                  const isSelected = selectedIds.has(sub.id)
                  return (
                    <div
                      key={sub.id}
                      className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''} ${isPurged ? 'opacity-40' : ''}`}
                    >
                      {!isPurged && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(sub.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer"
                        />
                      )}
                      <button
                        onClick={() => router.push(`/medic/submissions/${sub.id}`)}
                        className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-100">
                              {isPurged ? 'PHI Purged' : sub.worker_snapshot?.fullName || 'Unknown Worker'}
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
                        <div className="shrink-0 ml-3">
                          {isPurged ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">Purged</span>
                          ) : sub.exported_at ? (
                            <PurgeCountdown exportedAt={sub.exported_at} />
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

      {/* Medication Declarations Section */}
      {medDecEnabled && (
        <MedDecSection medDeclarations={medDeclarations} siteId={activeTab} />
      )}
    </div>
  )
}
