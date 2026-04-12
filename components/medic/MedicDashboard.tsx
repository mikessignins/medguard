'use client'

import { useEffect, useMemo, useState } from 'react'
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
  New: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  Approved: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Requires Follow-up': 'bg-red-500/10 text-red-400 border border-red-500/20',
  Recalled: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
}

const MEDDEC_FINAL = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']
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

const FATIGUE_RISK_ROW_STYLES: Record<FatigueRiskLevel, string> = {
  low: 'border-l-4 border-emerald-500 bg-emerald-500/5',
  medium: 'border-l-4 border-amber-500 bg-amber-500/5',
  high: 'border-l-4 border-red-500 bg-red-500/5',
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
type MedicModuleView = 'emergency' | 'medication' | 'fatigue'

interface Props {
  sites: Array<Pick<Site, 'id' | 'name' | 'is_office'>>
  submissions: MedicDashboardSubmission[]
  medDeclarations: MedicDashboardMedDec[]
  fatigueAssessments: MedicDashboardFatigue[]
  medDecEnabled: boolean
  fatigueEnabled: boolean
  initialSite?: string
  moduleView: MedicModuleView
}

function RiskChips({ sub }: { sub: Pick<Submission, 'worker_snapshot'> }) {
  const chips = computeRiskChips(sub)
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => {
        const styles: Record<RiskChip['type'], string> = {
          anaphylaxis: 'bg-red-500/10 border-red-500/25 text-red-400',
          'flagged-meds': 'bg-orange-500/10 border-orange-500/25 text-orange-400',
          conditions: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          clear: 'bg-slate-800/50 border-slate-700/50 text-slate-600',
        }
        return (
          <span key={chip.type} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[chip.type]}`}>
            {chip.label}
          </span>
        )
      })}
    </div>
  )
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

function formatFatigueDecision(decision: MedicDashboardFatigue['review_payload']['fitForWorkDecision']) {
  switch (decision) {
    case 'fit_normal_duties':
      return 'Fit for normal duties'
    case 'fit_restricted_duties':
      return 'Fit for restricted duties'
    case 'not_fit_for_work':
      return 'Not fit for work'
    case 'sent_to_room':
      return 'Sent to room'
    case 'sent_home':
      return 'Sent home'
    case 'requires_escalation':
      return 'Requires escalation'
    default:
      return 'Outcome recorded'
  }
}

function formatTimestamp(value: string | null | undefined, pattern = 'dd MMM yyyy · HH:mm') {
  if (!value) return 'Unknown time'
  try {
    return format(new Date(value), pattern)
  } catch {
    return 'Unknown time'
  }
}

function formatDate(value: string | null | undefined, pattern = 'dd MMM yyyy') {
  if (!value) return 'No date'
  try {
    return format(new Date(value), pattern)
  } catch {
    return 'No date'
  }
}

function ModuleHero({
  eyebrow,
  title,
  description,
  summary,
}: {
  eyebrow: string
  title: string
  description: string
  summary: string
}) {
  return (
    <section className="medic-hero">
      <div className="max-w-3xl">
        <p className="medic-kicker">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--medic-text)]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--medic-muted)]">{description}</p>
      </div>
      <div className="medic-summary-pill">{summary}</div>
    </section>
  )
}

function SiteSwitcher({
  sites,
  activeTab,
  onChange,
  badgeCounts,
}: {
  sites: Array<Pick<Site, 'id' | 'name' | 'is_office'>>
  activeTab: string
  onChange: (value: string) => void
  badgeCounts: Record<string, number>
}) {
  return (
    <div className="space-y-2">
      <p className="medic-kicker">Sites</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sites.map((site) => {
          const count = badgeCounts[site.id] || 0
          const active = activeTab === site.id
          return (
            <button
              key={site.id}
              onClick={() => onChange(site.id)}
              className={active ? 'medic-site-pill-active' : 'medic-site-pill'}
            >
              <span>{site.name}</span>
              {site.is_office && <span className="text-xs opacity-70">(Office)</span>}
              {count > 0 && <span className="medic-site-badge">{count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StatGrid({
  cards,
}: {
  cards: Array<{ label: string; value: number; helper: string; tone?: 'accent' | 'warn' | 'success' | 'danger' | 'muted'; onClick?: () => void }>
}) {
  const toneClass = {
    accent: 'text-[var(--medic-accent-strong)]',
    warn: 'text-amber-300',
    success: 'text-emerald-300',
    danger: 'text-red-300',
    muted: 'text-[var(--medic-text)]',
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <button
          key={card.label}
          onClick={card.onClick}
          disabled={!card.onClick}
          className="medic-stat-card text-left disabled:cursor-default"
        >
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--medic-muted)]">{card.label}</p>
          <p className={`mt-2 text-3xl font-semibold ${toneClass[card.tone ?? 'accent']}`}>{card.value}</p>
          <p className="mt-2 text-sm text-[var(--medic-muted)]">{card.helper}</p>
        </button>
      ))}
    </div>
  )
}

function ModuleDisabledState({ title, note }: { title: string; note: string }) {
  return (
    <div className="medic-empty-state">
      <h2 className="text-xl font-semibold text-[var(--medic-text)]">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--medic-muted)]">{note}</p>
    </div>
  )
}

export default function MedicDashboard({
  sites,
  submissions,
  medDeclarations,
  fatigueAssessments,
  medDecEnabled,
  fatigueEnabled,
  initialSite,
  moduleView,
}: Props) {
  const [activeTab, setActiveTab] = useState(initialSite || sites[0]?.id || '')
  const [filter, setFilter] = useState<FilterType>('All')
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
  const activeQueueSubmissions = siteSubmissions.filter(
    (s) => !s.exported_at && !s.phi_purged_at && ACTIVE_STATUS_ORDER.includes(s.status),
  )
  const newCount = activeQueueSubmissions.filter((s) => s.status === 'New').length
  const inReviewCount = activeQueueSubmissions.filter((s) => s.status === 'In Review').length
  const approvedCount = siteSubmissions.filter(
    (s) => !s.exported_at && !s.phi_purged_at && s.status === 'Approved',
  ).length
  const followUpCount = siteSubmissions.filter(
    (s) => !s.exported_at && !s.phi_purged_at && s.status === 'Requires Follow-up',
  ).length

  const activeMedDecs = medDecEnabled
    ? medDeclarations.filter(
        (m) => m.site_id === activeTab && !m.exported_at && !m.phi_purged_at && !MEDDEC_FINAL.includes(m.medic_review_status),
      )
    : []
  const medDecPendingCount = activeMedDecs.filter(
    (m) => !m.medic_review_status || m.medic_review_status === 'Pending',
  ).length
  const medDecInReviewCount = activeMedDecs.filter((m) => m.medic_review_status === 'In Review').length
  const medDecReadyToExport = medDecEnabled
    ? medDeclarations.filter(
        (m) => m.site_id === activeTab && !m.exported_at && !m.phi_purged_at && MEDDEC_FINAL.includes(m.medic_review_status),
      ).length
    : 0

  const activeFatigueAssessments = fatigueEnabled
    ? fatigueAssessments.filter(
        (item) => item.site_id === activeTab && !item.exported_at && !item.phi_purged_at && FATIGUE_ACTIVE_STATUSES.includes(item.status),
      )
    : []
  const resolvedFatigueAssessments = fatigueEnabled
    ? fatigueAssessments
        .filter((item) => item.site_id === activeTab && item.status === 'resolved' && !item.phi_purged_at)
        .slice(0, 10)
    : []
  const workerOnlyFatigueCount = fatigueEnabled
    ? fatigueAssessments.filter(
        (item) => item.site_id === activeTab && item.status === 'worker_only_complete' && !item.phi_purged_at,
      ).length
    : 0
  const fatigueReadyToExport = fatigueEnabled
    ? fatigueAssessments.filter(
        (item) => item.site_id === activeTab && item.status === 'resolved' && !item.exported_at && !item.phi_purged_at,
      ).length
    : 0
  const fatigueAwaitingCount = activeFatigueAssessments.filter((item) => item.status === 'awaiting_medic_review').length
  const fatigueInReviewCount = activeFatigueAssessments.filter((item) => item.status === 'in_medic_review').length
  const fatigueHighRiskCount = activeFatigueAssessments.filter(
    (item) => item.payload.workerScoreSummary.derivedRiskLevel === 'high',
  ).length
  const fatigueSupervisorSignals = activeFatigueAssessments.filter(
    (item) => item.review_payload.supervisorNotified || item.review_payload.requiresHigherMedicalReview,
  ).length

  const filtered = filter === 'All' ? activeQueueSubmissions : activeQueueSubmissions.filter((s) => s.status === filter)
  const grouped = ACTIVE_STATUS_ORDER.reduce((acc, status) => {
    acc[status] = filtered.filter((s) => s.status === status)
    return acc
  }, {} as Record<SubmissionStatus, MedicDashboardSubmission[]>)

  const badgeCounts = useMemo(
    () =>
      Object.fromEntries(
        sites.map((site) => {
          if (moduleView === 'medication') {
            const count = medDeclarations.filter(
              (m) => m.site_id === site.id && !m.exported_at && !m.phi_purged_at && !MEDDEC_FINAL.includes(m.medic_review_status),
            ).length
            return [site.id, count]
          }
          if (moduleView === 'fatigue') {
            const count = fatigueAssessments.filter(
              (item) => item.site_id === site.id && !item.exported_at && !item.phi_purged_at && FATIGUE_ACTIVE_STATUSES.includes(item.status),
            ).length
            return [site.id, count]
          }
          const count = submissions.filter(
            (s) =>
              s.site_id === site.id &&
              s.status !== 'Recalled' &&
              !s.exported_at &&
              !s.phi_purged_at &&
              ACTIVE_STATUS_ORDER.includes(s.status),
          ).length
          return [site.id, count]
        }),
      ),
    [fatigueAssessments, medDeclarations, moduleView, sites, submissions],
  )

  if (sites.length === 0) {
    return (
      <div className="medic-empty-state">
        <h2 className="text-xl font-semibold text-[var(--medic-text)]">No sites assigned to your account</h2>
        <p className="mt-2 text-sm text-[var(--medic-muted)]">Contact your administrator to be assigned to a site before reviewing module queues.</p>
      </div>
    )
  }

  if (moduleView === 'medication' && !medDecEnabled) {
    return (
      <ModuleDisabledState
        title="Medication declarations are not enabled"
        note="This business has not turned on the confidential medication workflow for medic review yet."
      />
    )
  }

  if (moduleView === 'fatigue' && !fatigueEnabled) {
    return (
      <ModuleDisabledState
        title="Fatigue assessment is not enabled"
        note="Enable the fatigue module for this business before workers and medics can use the fatigue workflow."
      />
    )
  }

  if (moduleView === 'emergency') {
    const emergencyCards = [
      { label: 'Outstanding', value: newCount + inReviewCount, helper: 'Open declarations across the selected site', tone: 'accent' as const },
      { label: 'New', value: newCount, helper: 'Needs first review', tone: 'accent' as const, onClick: () => setFilter('New') },
      { label: 'In Review', value: inReviewCount, helper: 'Already opened by a medic', tone: 'warn' as const, onClick: () => setFilter('In Review') },
      { label: 'Ready for Export', value: approvedCount + followUpCount, helper: 'Closed clinically and waiting in exports', tone: 'success' as const, onClick: () => router.push(`/medic/exports?site=${activeTab}`) },
    ]

    return (
      <div className="space-y-6">
        <ModuleHero
          eyebrow="Emergency Medical"
          title="Operational declaration queue"
          description="Review live emergency medical declarations by site, prioritise new submissions, and move finalised decisions into exports."
          summary={`${newCount + inReviewCount} active declaration${newCount + inReviewCount === 1 ? '' : 's'} on ${sites.find((site) => site.id === activeTab)?.name || 'this site'}`}
        />

        <SiteSwitcher sites={sites} activeTab={activeTab} onChange={(value) => { setActiveTab(value); setFilter('All') }} badgeCounts={badgeCounts} />
        <StatGrid cards={emergencyCards} />

        {(newCount > 0 || approvedCount + followUpCount > 0) && (
          <div className="medic-inline-alert">
            <span>
              <strong>{newCount}</strong> new declaration{newCount === 1 ? '' : 's'} awaiting first review.
              {' '}
              <strong>{approvedCount + followUpCount}</strong> already belong in exports.
            </span>
            <button onClick={() => router.push(`/medic/exports?site=${activeTab}`)} className="font-semibold text-[var(--medic-accent-strong)] transition-colors hover:text-[var(--medic-text)]">
              Open exports →
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(['All', 'New', 'In Review'] as FilterType[]).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={filter === value ? 'medic-filter-chip-active' : 'medic-filter-chip'}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          {ACTIVE_STATUS_ORDER.map((status) => {
            const items = grouped[status]
            if (!items || items.length === 0) return null
            return (
              <section key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--medic-muted)]">
                    {status} <span className="font-normal">({items.length})</span>
                  </h2>
                </div>
                <div className="medic-list-shell">
                  {items.map((sub, index) => {
                    const queueIds = ACTIVE_STATUS_ORDER.flatMap((groupStatus) => grouped[groupStatus] ?? []).map((item) => item.id)
                    const pos = queueIds.indexOf(sub.id)
                    return (
                      <Link
                        key={sub.id}
                        href={`/medic/submissions/${sub.id}?${encodeQueue(queueIds, pos)}&site=${encodeURIComponent(activeTab)}`}
                        className={`medic-list-row ${index > 0 ? 'border-t border-[var(--medic-border)]' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-[var(--medic-text)]">{sub.worker_snapshot?.fullName || 'Unknown Worker'}</p>
                            <span className="text-sm text-[var(--medic-muted)]">{sub.role || 'Unknown role'}</span>
                          </div>
                          <RiskChips sub={sub} />
                          <p className="mt-1 text-sm text-[var(--medic-muted)]">
                            {formatDate(sub.visit_date)} · {sub.shift_type || 'N/A'}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}>
                          {status}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {filtered.length === 0 && (
            <div className="medic-empty-state py-12">
              <p className="text-sm text-[var(--medic-muted)]">
                {filter === 'All' ? 'No active declaration review items for this site.' : `No active declaration items with status "${filter}".`}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (moduleView === 'medication') {
    const medicationCards = [
      { label: 'Outstanding', value: activeMedDecs.length, helper: 'Confidential declarations still in the medic queue', tone: 'accent' as const },
      { label: 'Pending', value: medDecPendingCount, helper: 'Waiting to be opened', tone: 'accent' as const },
      { label: 'In Review', value: medDecInReviewCount, helper: 'Currently under medic review', tone: 'warn' as const },
      { label: 'Ready for Export', value: medDecReadyToExport, helper: 'Final decisions sitting in exports', tone: 'success' as const, onClick: () => router.push(`/medic/exports?site=${activeTab}`) },
    ]

    return (
      <div className="space-y-6">
        <ModuleHero
          eyebrow="Medication Declarations"
          title="Confidential medication workflow"
          description="Handle confidential medication declarations separately from the emergency queue, with clear visibility into pending, in-review, and export-ready work."
          summary={`${activeMedDecs.length} active medication declaration${activeMedDecs.length === 1 ? '' : 's'} on ${sites.find((site) => site.id === activeTab)?.name || 'this site'}`}
        />

        <SiteSwitcher sites={sites} activeTab={activeTab} onChange={setActiveTab} badgeCounts={badgeCounts} />
        <StatGrid cards={medicationCards} />
        <MedDecSection medDeclarations={medDeclarations} siteId={activeTab} exportsHref={`/medic/exports?site=${activeTab}`} />
      </div>
    )
  }

  const fatigueCards = [
    { label: 'Outstanding', value: activeFatigueAssessments.length, helper: 'Active fatigue reviews across the selected site', tone: 'accent' as const },
    { label: 'Awaiting Review', value: fatigueAwaitingCount, helper: 'Worker checks waiting for first medic review', tone: 'accent' as const },
    { label: 'In Review', value: fatigueInReviewCount, helper: 'Already opened by a medic', tone: 'warn' as const },
    { label: 'High Risk', value: fatigueHighRiskCount, helper: 'Immediate attention candidates', tone: 'danger' as const },
    { label: 'Worker Only', value: workerOnlyFatigueCount, helper: 'Low-risk checks that do not enter the medic queue', tone: 'muted' as const },
    { label: 'Ready for Export', value: fatigueReadyToExport, helper: 'Reviewed outcomes waiting in exports', tone: 'success' as const, onClick: () => router.push(`/medic/exports?site=${activeTab}`) },
  ]

  return (
    <div className="space-y-6">
      <ModuleHero
        eyebrow="Fatigue Assessment"
        title="Fatigue review operations"
        description="Track worker fatigue self-assessments by site, surface the highest-risk items first, and keep recently reviewed outcomes visible for handover and operational follow-up."
        summary={`${activeFatigueAssessments.length} active fatigue assessment${activeFatigueAssessments.length === 1 ? '' : 's'} · ${fatigueSupervisorSignals} needing supervisor or escalation signals`}
      />

      <SiteSwitcher sites={sites} activeTab={activeTab} onChange={setActiveTab} badgeCounts={badgeCounts} />
      <StatGrid cards={fatigueCards} />

      {activeFatigueAssessments.length > 0 && (
        <div className="medic-inline-alert">
          <span>
            <strong>{fatigueHighRiskCount}</strong> high-risk fatigue assessment{fatigueHighRiskCount === 1 ? '' : 's'} currently visible in the selected site queue.
          </span>
        </div>
      )}

      {workerOnlyFatigueCount > 0 && (
        <div className="medic-inline-alert">
          <span>
            <strong>{workerOnlyFatigueCount}</strong> low-risk fatigue check{workerOnlyFatigueCount === 1 ? '' : 's'} were submitted as worker-only and do not require medic review, so they are not listed in the live queue.
          </span>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--medic-muted)]">Live queue</h2>
        {activeFatigueAssessments.length === 0 ? (
          <div className="medic-empty-state py-12">
            <p className="text-sm text-[var(--medic-muted)]">
              {workerOnlyFatigueCount > 0
                ? 'No fatigue assessments currently require medic review for this site. Low-risk worker-only checks are counted above.'
                : 'No active fatigue assessments for this site.'}
            </p>
          </div>
        ) : (
          <div className="medic-list-shell">
            {activeFatigueAssessments.map((item, index) => {
              const queueIds = activeFatigueAssessments.map((entry) => entry.id)
              const pos = queueIds.indexOf(item.id)
              const worker = item.payload.workerAssessment
              const summary = item.payload.workerScoreSummary
              return (
                <Link
                  key={item.id}
                  href={`/medic/fatigue/${item.id}?${encodeQueue(queueIds, pos)}&site=${encodeURIComponent(activeTab)}`}
                  className={`medic-list-row ${FATIGUE_RISK_ROW_STYLES[summary.derivedRiskLevel]} ${index > 0 ? 'border-t border-[var(--medic-border)]' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--medic-text)]">{worker.workerNameSnapshot || 'Unknown Worker'}</p>
                      <span className="text-sm text-[var(--medic-muted)]">{worker.jobRole || 'Unknown role'}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${FATIGUE_RISK_STYLES[summary.derivedRiskLevel]}`}>
                        {summary.derivedRiskLevel.toUpperCase()} RISK
                      </span>
                      <span className="rounded-full border border-slate-600 bg-slate-900/60 px-2 py-0.5 text-xs font-semibold text-slate-200">
                        Score {summary.fatigueScoreTotal}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--medic-muted)]">
                      {formatFatigueContext(worker.assessmentContext)}
                      {worker.rosterPattern ? ` · ${worker.rosterPattern}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-[var(--medic-muted)]">
                      Submitted {formatTimestamp(item.submitted_at)}
                    </p>
                    {item.review_payload.reviewedByName && (
                      <p className="mt-1 text-xs text-[var(--medic-muted)]">
                        Reviewer {item.review_payload.reviewedByName}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${FATIGUE_STATUS_STYLES[item.status]}`}>
                    {formatFatigueStatus(item.status)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--medic-muted)]">Recently reviewed</h2>
        {resolvedFatigueAssessments.length === 0 ? (
          <div className="medic-empty-state py-12">
            <p className="text-sm text-[var(--medic-muted)]">Reviewed fatigue outcomes will stay visible here after a medic closes them.</p>
          </div>
        ) : (
          <div className="medic-list-shell">
            {resolvedFatigueAssessments.map((item, index) => {
              const summary = item.payload.workerScoreSummary
              const review = item.review_payload
              const signals = [
                review.supervisorNotified ? 'Supervisor notified' : null,
                review.transportArranged ? 'Transport arranged' : null,
                review.sentToRoom ? 'Sent to room' : null,
                review.sentHome ? 'Sent home' : null,
                review.requiresHigherMedicalReview ? 'Escalated' : null,
                review.requiresFollowUp ? 'Follow-up required' : null,
              ].filter(Boolean) as string[]
              return (
                <Link
                  key={item.id}
                  href={`/medic/fatigue/${item.id}?site=${encodeURIComponent(activeTab)}`}
                  className={`medic-list-row ${index > 0 ? 'border-t border-[var(--medic-border)]' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--medic-text)]">{item.payload.workerAssessment.workerNameSnapshot || 'Unknown Worker'}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${FATIGUE_RISK_STYLES[summary.derivedRiskLevel]}`}>
                        {summary.derivedRiskLevel.toUpperCase()}
                      </span>
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        {formatFatigueDecision(review.fitForWorkDecision)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--medic-muted)]">
                      {[
                        item.review_payload.reviewedByName ? `Reviewed by ${item.review_payload.reviewedByName}` : null,
                        !item.exported_at ? 'Ready for export' : 'Exported',
                        signals.length > 0 ? signals.join(' · ') : null,
                      ].filter(Boolean).join(' · ') || 'No additional follow-up flags recorded'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--medic-muted)]">Reviewed {formatTimestamp(item.reviewed_at || item.submitted_at)}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
