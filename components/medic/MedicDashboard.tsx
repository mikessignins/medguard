'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { Site, Submission, SubmissionStatus, MedicationDeclaration } from '@/lib/types'
import MedDecSection from '@/components/medic/MedDecSection'
import { computeRiskChips, type RiskChip } from '@/lib/risk-chips'
import { encodeQueue } from '@/lib/queue-params'

const ACTIVE_STATUS_ORDER: SubmissionStatus[] = ['New', 'In Review']
const FINAL_SUBMISSION_STATUSES: SubmissionStatus[] = ['Approved', 'Requires Follow-up']

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  'New': 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Approved': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Requires Follow-up': 'bg-red-500/10 text-red-400 border border-red-500/20',
  'Recalled': 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
}

const MEDDEC_FINAL = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']

function RiskChips({ sub }: { sub: Submission }) {
  const chips = computeRiskChips(sub)
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
      {chips.map((chip) => {
        const styles: Record<RiskChip['type'], string> = {
          'anaphylaxis': 'bg-red-500/10 border-red-500/25 text-red-400',
          'flagged-meds': 'bg-orange-500/10 border-orange-500/25 text-orange-400',
          'conditions': 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          'clear': 'bg-slate-800/50 border-slate-700/50 text-slate-600',
        }
        return (
          <span key={chip.type} className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[chip.type]}`}>
            {chip.label}
          </span>
        )
      })}
    </div>
  )
}

type FilterType = 'All' | 'New' | 'In Review'

interface Props {
  sites: Site[]
  submissions: Submission[]
  medDeclarations: MedicationDeclaration[]
  medDecEnabled: boolean
  initialSite?: string
}

export default function MedicDashboard({ sites, submissions, medDeclarations, medDecEnabled, initialSite }: Props) {
  const [activeTab, setActiveTab] = useState(initialSite || sites[0]?.id || '')
  const [filter, setFilter] = useState<FilterType>('All')
  const [activeSection, setActiveSection] = useState<'declarations' | 'meddec'>('declarations')
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const siteIds = sites.map((site) => site.id)
    if (siteIds.length === 0) return

    const channel = supabase
      .channel('medic-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, (payload) => {
        const row = payload.new as { site_id?: string }
        if (siteIds.includes(row.site_id ?? '')) router.refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'submissions' }, (payload) => {
        const row = payload.new as { site_id?: string }
        if (siteIds.includes(row.site_id ?? '')) router.refresh()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'medication_declarations' }, (payload) => {
        const row = payload.new as { site_id?: string }
        if (siteIds.includes(row.site_id ?? '')) router.refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'medication_declarations' }, (payload) => {
        const row = payload.new as { site_id?: string }
        if (siteIds.includes(row.site_id ?? '')) router.refresh()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sites, router])

  const siteSubmissions = submissions.filter((s) => s.site_id === activeTab && s.status !== 'Recalled')
  const activeQueueSubmissions = siteSubmissions.filter((s) => !s.exported_at && !s.phi_purged_at && ACTIVE_STATUS_ORDER.includes(s.status))
  const newCount = activeQueueSubmissions.filter((s) => s.status === 'New').length
  const pendingMedDecCount = medDecEnabled
    ? medDeclarations.filter((m) => m.site_id === activeTab && !m.exported_at && !m.phi_purged_at && !MEDDEC_FINAL.includes(m.medic_review_status)).length
    : 0
  const readyToExportCount = siteSubmissions.filter((s) => !s.exported_at && !s.phi_purged_at && FINAL_SUBMISSION_STATUSES.includes(s.status)).length
  const readyMedDecCount = medDecEnabled
    ? medDeclarations.filter((m) => m.site_id === activeTab && !m.exported_at && !m.phi_purged_at && MEDDEC_FINAL.includes(m.medic_review_status)).length
    : 0

  const filtered = filter === 'All'
    ? activeQueueSubmissions
    : activeQueueSubmissions.filter((s) => s.status === filter)

  const grouped = ACTIVE_STATUS_ORDER.reduce((acc, status) => {
    acc[status] = filtered.filter((s) => s.status === status)
    return acc
  }, {} as Record<SubmissionStatus, Submission[]>)

  if (sites.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg">No sites assigned to your account.</p>
        <p className="text-sm mt-1">Contact your administrator to be assigned to a site.</p>
      </div>
    )
  }

  const statNew = activeQueueSubmissions.filter((s) => s.status === 'New').length
  const statInReview = activeQueueSubmissions.filter((s) => s.status === 'In Review').length

  return (
    <div>
      <div className={`grid grid-cols-2 gap-3 mb-4 ${medDecEnabled ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {([
          { label: 'New', status: 'New' as FilterType, value: statNew, color: 'text-indigo-400', active: 'bg-indigo-500/15 border-indigo-500/40' },
          { label: 'In Review', status: 'In Review' as FilterType, value: statInReview, color: 'text-amber-400', active: 'bg-amber-500/15 border-amber-500/40' },
        ] as const).map((card) => (
          <button
            key={card.status}
            onClick={() => setFilter((value) => value === card.status ? 'All' : card.status)}
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

      {newCount > 0 && (
        <div className="mb-5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span><strong>{newCount} medical declaration{newCount !== 1 ? 's' : ''}</strong> awaiting review on this site.</span>
        </div>
      )}

      {pendingMedDecCount > 0 && (
        <div className="mb-5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span><strong>{pendingMedDecCount} medication declaration{pendingMedDecCount !== 1 ? 's' : ''}</strong> pending review on this site.</span>
        </div>
      )}

      {(readyToExportCount > 0 || readyMedDecCount > 0) && (
        <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>
              <strong>{readyToExportCount + readyMedDecCount} declaration{readyToExportCount + readyMedDecCount !== 1 ? 's' : ''}</strong> already reviewed and ready to export.
            </span>
            <button
              onClick={() => router.push(`/medic/exports?site=${activeTab}`)}
              className="text-sm font-semibold text-amber-300 hover:text-white transition-colors"
            >
              Open exports →
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {sites.map((site) => {
          const siteNew = submissions.filter((s) => s.site_id === site.id && s.status === 'New' && !s.exported_at).length
          const siteMedDecPending = medDecEnabled
            ? medDeclarations.filter((m) => m.site_id === site.id && !m.exported_at && !m.phi_purged_at && !MEDDEC_FINAL.includes(m.medic_review_status)).length
            : 0
          const isActive = activeTab === site.id
          return (
            <button
              key={site.id}
              onClick={() => { setActiveTab(site.id); setFilter('All'); setActiveSection('declarations') }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all duration-150 shrink-0 ${
                isActive
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {site.name}
              {site.is_office && <span className="text-xs text-slate-600">(Office)</span>}
              {siteNew > 0 && <span className="bg-cyan-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">{siteNew}</span>}
              {siteMedDecPending > 0 && <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">{siteMedDecPending}</span>}
            </button>
          )
        })}
      </div>

      {medDecEnabled ? (
        <div role="tablist" className="flex border-b border-slate-800 mb-5">
          <button
            role="tab"
            aria-selected={activeSection === 'declarations'}
            onClick={() => setActiveSection('declarations')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeSection === 'declarations'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Medical Information
          </button>
          <button
            role="tab"
            aria-selected={activeSection === 'meddec'}
            onClick={() => setActiveSection('meddec')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
              activeSection === 'meddec'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Medication Declarations
            {pendingMedDecCount > 0 && (
              <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">
                {pendingMedDecCount}
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Medical Information</h2>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
      )}

      {activeSection === 'declarations' && (
        <div className="space-y-6">
          {ACTIVE_STATUS_ORDER.map((status) => {
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
                      onClick={() => {
                        const queueIds = ACTIVE_STATUS_ORDER.flatMap((groupStatus) => grouped[groupStatus] ?? []).map((item) => item.id)
                        const pos = queueIds.indexOf(sub.id)
                        router.push(`/medic/submissions/${sub.id}?${encodeQueue(queueIds, pos)}`)
                      }}
                      className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-100">{sub.worker_snapshot?.fullName || 'Unknown Worker'}</p>
                          <span className="text-sm text-slate-500">{sub.role || 'Unknown role'}</span>
                        </div>
                        <RiskChips sub={sub} />
                        <p className="text-sm text-slate-500 mt-1">
                          {(() => { try { return sub.visit_date ? format(new Date(sub.visit_date), 'dd MMM yyyy') : 'No date' } catch { return 'No date' } })()}
                          {' · '}{sub.shift_type || 'N/A'}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[status]} shrink-0 ml-3`}>
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
              {filter === 'All' ? 'No active review items for this site.' : `No active review items with status "${filter}".`}
            </p>
          )}
        </div>
      )}

      {activeSection === 'meddec' && (
        <MedDecSection
          medDeclarations={medDeclarations}
          siteId={activeTab}
          exportsHref={`/medic/exports?site=${activeTab}`}
        />
      )}
    </div>
  )
}
