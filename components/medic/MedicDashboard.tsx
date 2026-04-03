'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type {
  Site,
  Submission,
  SubmissionStatus,
  MedicationDeclaration,
  FatigueAssessment,
  FatigueRiskLevel,
  FatigueAssessmentQueueStatus,
} from '@/lib/types'
import MedDecSection from '@/components/medic/MedDecSection'
import { computeRiskChips, type RiskChip } from '@/lib/risk-chips'
import { encodeQueue } from '@/lib/queue-params'

const ACTIVE_STATUS_ORDER: SubmissionStatus[] = ['New', 'In Review']
const STATUS_COLORS: Record<SubmissionStatus, string> = {
  'New': 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Approved': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Requires Follow-up': 'bg-red-500/10 text-red-400 border border-red-500/20',
  'Recalled': 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
}

const MEDDEC_FINAL = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']

function RiskChips({ sub }: { sub: Pick<Submission, 'worker_snapshot'> }) {
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

type MedicDashboardSubmission = Pick<
  Submission,
  'id' | 'business_id' | 'site_id' | 'worker_snapshot' | 'role' | 'visit_date' | 'shift_type' | 'status' | 'submitted_at' | 'exported_at' | 'phi_purged_at'
>

type MedicDashboardMedDec = Pick<
  MedicationDeclaration,
  'id' | 'business_id' | 'site_id' | 'worker_name' | 'submitted_at' | 'medic_review_status' | 'exported_at' | 'phi_purged_at' | 'medications' | 'has_recent_injury_or_illness' | 'has_side_effects'
>

type MedicDashboardFatigue = FatigueAssessment

type FilterType = 'All' | 'New' | 'In Review'
type ActiveSection = 'declarations' | 'meddec' | 'fatigue'

interface Props {
  sites: Array<Pick<Site, 'id' | 'name' | 'is_office'>>
  submissions: MedicDashboardSubmission[]
  medDeclarations: MedicDashboardMedDec[]
  fatigueAssessments: MedicDashboardFatigue[]
  medDecEnabled: boolean
  fatigueEnabled: boolean
  initialSite?: string
}

const FATIGUE_ACTIVE_STATUSES: FatigueAssessmentQueueStatus[] = ['awaiting_medic_review', 'in_medic_review']

const FATIGUE_STATUS_STYLES: Record<FatigueAssessmentQueueStatus, string> = {
  worker_only_complete: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  awaiting_medic_review: 'bg-violet-500/10 text-violet-300 border border-violet-500/20',
  in_medic_review: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

const FATIGUE_RISK_STYLES: Record<FatigueRiskLevel, string> = {
  low: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  medium: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  high: 'bg-red-500/10 border-red-500/20 text-red-300',
}

function formatFatigueStatus(status: FatigueAssessmentQueueStatus) {
  switch (status) {
    case 'worker_only_complete':
      return 'Worker Only'
    case 'awaiting_medic_review':
      return 'Awaiting Review'
    case 'in_medic_review':
      return 'In Review'
    case 'resolved':
      return 'Resolved'
  }
}

function formatFatigueContext(context: MedicDashboardFatigue['payload']['workerAssessment']['assessmentContext']) {
  switch (context) {
    case 'pre_shift':
      return 'Pre-shift'
    case 'during_shift':
      return 'During shift'
    case 'post_shift':
      return 'Post-shift'
    case 'journey_management':
      return 'Journey management'
    case 'peer_or_supervisor_concern':
      return 'Peer or supervisor concern'
    case 'other':
      return 'Other'
  }
}

export default function MedicDashboard({
  sites,
  submissions,
  medDeclarations,
  fatigueAssessments,
  medDecEnabled,
  fatigueEnabled,
  initialSite,
}: Props) {
  const [activeTab, setActiveTab] = useState(initialSite || sites[0]?.id || '')
  const [filter, setFilter] = useState<FilterType>('All')
  const [activeSection, setActiveSection] = useState<ActiveSection>('declarations')
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'module_submissions' }, (payload) => {
        const row = payload.new as { site_id?: string; module_key?: string }
        if (row.module_key === 'fatigue_assessment' && siteIds.includes(row.site_id ?? '')) router.refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'module_submissions' }, (payload) => {
        const row = payload.new as { site_id?: string; module_key?: string }
        if (row.module_key === 'fatigue_assessment' && siteIds.includes(row.site_id ?? '')) router.refresh()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sites, router])

  const siteSubmissions = submissions.filter((s) => s.site_id === activeTab && s.status !== 'Recalled')
  const activeQueueSubmissions = siteSubmissions.filter((s) => !s.exported_at && !s.phi_purged_at && ACTIVE_STATUS_ORDER.includes(s.status))
  const newCount = activeQueueSubmissions.filter((s) => s.status === 'New').length
  const inReviewCount = activeQueueSubmissions.filter((s) => s.status === 'In Review').length
  const approvedCount = siteSubmissions.filter((s) => !s.exported_at && !s.phi_purged_at && s.status === 'Approved').length
  const followUpCount = siteSubmissions.filter((s) => !s.exported_at && !s.phi_purged_at && s.status === 'Requires Follow-up').length

  const activeMedDecs = medDecEnabled
    ? medDeclarations.filter((m) => m.site_id === activeTab && !m.exported_at && !m.phi_purged_at && !MEDDEC_FINAL.includes(m.medic_review_status))
    : []
  const medDecPendingCount = activeMedDecs.filter((m) => !m.medic_review_status || m.medic_review_status === 'Pending').length
  const medDecInReviewCount = activeMedDecs.filter((m) => m.medic_review_status === 'In Review').length
  const medDecActiveCount = activeMedDecs.length
  const activeFatigueAssessments = fatigueEnabled
    ? fatigueAssessments.filter((item) => item.site_id === activeTab && !item.exported_at && !item.phi_purged_at && FATIGUE_ACTIVE_STATUSES.includes(item.status))
    : []
  const fatigueAwaitingCount = activeFatigueAssessments.filter((item) => item.status === 'awaiting_medic_review').length
  const fatigueInReviewCount = activeFatigueAssessments.filter((item) => item.status === 'in_medic_review').length
  const fatigueActiveCount = activeFatigueAssessments.length
  const readyToExportCount = approvedCount + followUpCount
  const readyMedDecCount = medDecEnabled
    ? medDeclarations.filter((m) => m.site_id === activeTab && !m.exported_at && !m.phi_purged_at && MEDDEC_FINAL.includes(m.medic_review_status)).length
    : 0

  const filtered = filter === 'All'
    ? activeQueueSubmissions
    : activeQueueSubmissions.filter((s) => s.status === filter)

  const grouped = ACTIVE_STATUS_ORDER.reduce((acc, status) => {
    acc[status] = filtered.filter((s) => s.status === status)
    return acc
  }, {} as Record<SubmissionStatus, MedicDashboardSubmission[]>)

  if (sites.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg">No sites assigned to your account.</p>
        <p className="text-sm mt-1">Contact your administrator to be assigned to a site.</p>
      </div>
    )
  }

  const declarationCards = [
    { label: 'New', value: newCount, color: 'text-indigo-400', active: 'bg-indigo-500/15 border-indigo-500/40', onClick: () => { setActiveSection('declarations'); setFilter((value) => value === 'New' ? 'All' : 'New') }, selected: activeSection === 'declarations' && filter === 'New', helper: 'Needs first review' },
    { label: 'In Review', value: inReviewCount, color: 'text-amber-400', active: 'bg-amber-500/15 border-amber-500/40', onClick: () => { setActiveSection('declarations'); setFilter((value) => value === 'In Review' ? 'All' : 'In Review') }, selected: activeSection === 'declarations' && filter === 'In Review', helper: 'Already opened by a medic' },
    { label: 'Approved', value: approvedCount, color: 'text-emerald-400', active: 'bg-emerald-500/15 border-emerald-500/40', onClick: () => router.push(`/medic/exports?site=${activeTab}`), selected: false, helper: 'Ready to export' },
    { label: 'Follow-up', value: followUpCount, color: 'text-red-400', active: 'bg-red-500/15 border-red-500/40', onClick: () => router.push(`/medic/exports?site=${activeTab}`), selected: false, helper: 'Decision made, export from exports' },
  ] as const

  const medDecCards = [
    { label: 'Pending', value: medDecPendingCount, color: 'text-violet-400', active: 'bg-violet-500/15 border-violet-500/40', helper: 'Not yet opened' },
    { label: 'In Review', value: medDecInReviewCount, color: 'text-amber-400', active: 'bg-amber-500/15 border-amber-500/40', helper: 'Already opened by a medic' },
    { label: 'Ready to Export', value: readyMedDecCount, color: 'text-emerald-400', active: 'bg-emerald-500/15 border-emerald-500/40', helper: 'Moved to exports after final decision' },
  ] as const

  const fatigueCards = [
    { label: 'Awaiting Review', value: fatigueAwaitingCount, color: 'text-violet-300', helper: 'Worker fatigue checks needing first review' },
    { label: 'In Review', value: fatigueInReviewCount, color: 'text-amber-400', helper: 'Already opened by a medic' },
  ] as const

  return (
    <div>
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Emergency Medical Forms</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {declarationCards.map((card) => (
              <button
                key={card.label}
                onClick={card.onClick}
                aria-pressed={card.selected}
                className={`text-left p-4 rounded-xl border transition-all duration-150 ${
                  card.selected
                    ? card.active
                    : 'bg-slate-800/60 border-slate-700/50 hover:border-slate-600/60'
                }`}
              >
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                <p className="text-xs text-slate-600 mt-1">{card.helper}</p>
              </button>
            ))}
          </div>
        </div>

        {medDecEnabled && (
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Confidential Medication Declarations</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {medDecCards.map((card) => (
                <button
                  key={card.label}
                  onClick={() => {
                    if (card.label === 'Ready to Export') router.push(`/medic/exports?site=${activeTab}`)
                    else setActiveSection('meddec')
                  }}
                  aria-pressed={activeSection === 'meddec' && card.label !== 'Ready to Export'}
                  className={`text-left p-4 rounded-xl border transition-all duration-150 ${
                    activeSection === 'meddec' && card.label !== 'Ready to Export'
                      ? 'bg-indigo-500/15 border-indigo-500/40'
                      : 'bg-slate-800/60 border-slate-700/50 hover:border-slate-600/60'
                  }`}
                >
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-slate-600 mt-1">{card.helper}</p>
                </button>
              ))}
            </div>
          </div>
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

      {medDecActiveCount > 0 && (
        <div className="mb-5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span><strong>{medDecActiveCount} medication declaration{medDecActiveCount !== 1 ? 's' : ''}</strong> active on this site, including {medDecInReviewCount} already in review.</span>
        </div>
      )}

      {fatigueActiveCount > 0 && (
        <div className="mb-5 bg-violet-500/10 border border-violet-500/20 text-violet-200 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-violet-300" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-12a.75.75 0 00-1.5 0v4.19l-1.72 1.72a.75.75 0 101.06 1.06l1.94-1.94A.75.75 0 0010.75 10V6z" clipRule="evenodd" />
          </svg>
          <span><strong>{fatigueActiveCount} fatigue assessment{fatigueActiveCount !== 1 ? 's' : ''}</strong> active on this site, including {fatigueInReviewCount} already in review.</span>
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
          const siteDeclarationActive = submissions.filter((s) =>
            s.site_id === site.id &&
            s.status !== 'Recalled' &&
            !s.exported_at &&
            !s.phi_purged_at &&
            ACTIVE_STATUS_ORDER.includes(s.status)
          ).length
          const siteMedDecActive = medDecEnabled
            ? medDeclarations.filter((m) => m.site_id === site.id && !m.exported_at && !m.phi_purged_at && !MEDDEC_FINAL.includes(m.medic_review_status)).length
            : 0
          const siteFatigueActive = fatigueEnabled
            ? fatigueAssessments.filter((item) => item.site_id === site.id && !item.exported_at && !item.phi_purged_at && FATIGUE_ACTIVE_STATUSES.includes(item.status)).length
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
              {siteDeclarationActive > 0 && <span className="bg-cyan-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">{siteDeclarationActive}</span>}
              {siteMedDecActive > 0 && <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">{siteMedDecActive}</span>}
              {siteFatigueActive > 0 && <span className="bg-violet-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">{siteFatigueActive}</span>}
            </button>
          )
        })}
      </div>

      {medDecEnabled || fatigueEnabled ? (
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
          {medDecEnabled && (
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
              {medDecActiveCount > 0 && (
                <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">
                  {medDecActiveCount}
                </span>
              )}
            </button>
          )}
          {fatigueEnabled && (
            <button
              role="tab"
              aria-selected={activeSection === 'fatigue'}
              onClick={() => setActiveSection('fatigue')}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                activeSection === 'fatigue'
                  ? 'border-violet-500 text-violet-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Fatigue Assessments
              {fatigueActiveCount > 0 && (
                <span className="bg-violet-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">
                  {fatigueActiveCount}
                </span>
              )}
            </button>
          )}
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
                    <Link
                      key={sub.id}
                      href={(() => {
                        const queueIds = ACTIVE_STATUS_ORDER.flatMap((groupStatus) => grouped[groupStatus] ?? []).map((item) => item.id)
                        const pos = queueIds.indexOf(sub.id)
                        return `/medic/submissions/${sub.id}?${encodeQueue(queueIds, pos)}`
                      })()}
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
                    </Link>
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

      {activeSection === 'fatigue' && (
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Fatigue Assessments</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {fatigueCards.map((card) => (
                <button
                  key={card.label}
                  onClick={() => setActiveSection('fatigue')}
                  className="text-left rounded-xl border bg-slate-800/60 border-slate-700/50 px-4 py-4"
                >
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-slate-600 mt-1">{card.helper}</p>
                </button>
              ))}
            </div>
          </div>

          {activeFatigueAssessments.length === 0 ? (
            <p className="text-center py-12 text-slate-600">No active fatigue assessments for this site.</p>
          ) : (
            <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
              {activeFatigueAssessments.map((item, index) => {
                const queueIds = activeFatigueAssessments.map((entry) => entry.id)
                const pos = queueIds.indexOf(item.id)
                const worker = item.payload.workerAssessment
                const summary = item.payload.workerScoreSummary
                return (
                  <Link
                    key={item.id}
                    href={`/medic/fatigue/${item.id}?${encodeQueue(queueIds, pos)}&site=${encodeURIComponent(activeTab)}`}
                    className={`block px-5 py-4 hover:bg-slate-700/30 transition-colors ${index > 0 ? 'border-t border-slate-700/50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-100">{worker.workerNameSnapshot || 'Unknown Worker'}</p>
                          <span className="text-sm text-slate-500">{worker.jobRole || 'Unknown role'}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${FATIGUE_RISK_STYLES[summary.derivedRiskLevel]}`}>
                            {summary.derivedRiskLevel.toUpperCase()} RISK
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatFatigueContext(worker.assessmentContext)} · Score {summary.fatigueScoreTotal}
                          {worker.rosterPattern ? ` · ${worker.rosterPattern}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Submitted {(() => { try { return format(new Date(item.submitted_at), 'dd MMM yyyy · HH:mm') } catch { return 'Unknown time' } })()}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${FATIGUE_STATUS_STYLES[item.status]}`}>
                        {formatFatigueStatus(item.status)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
