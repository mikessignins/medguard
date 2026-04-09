'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  formatPsychosocialAssignedReviewPath,
  formatPsychosocialRiskLevel,
  formatPsychosocialStatus,
  formatPsychosocialWorkflowKind,
  getPsychosocialHazardSignals,
  getPsychosocialJobRole,
  getPsychosocialWorkerName,
  getPsychosocialWorkflowKind,
  PSYCHOSOCIAL_HAZARDS,
} from '@/lib/psychosocial'
import { encodeQueue } from '@/lib/queue-params'
import type { PsychosocialAssessment, Site } from '@/lib/types'

const ACTIVE_STATUSES: Array<PsychosocialAssessment['status']> = [
  'review_recommended',
  'awaiting_medic_review',
  'in_medic_review',
  'awaiting_follow_up',
]

const STATUS_STYLES: Record<PsychosocialAssessment['status'], string> = {
  worker_only_complete: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  review_recommended: 'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  awaiting_medic_review: 'bg-violet-500/10 text-violet-300 border border-violet-500/20',
  in_medic_review: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  awaiting_follow_up: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
}

const RISK_STYLES: Record<NonNullable<PsychosocialAssessment['payload']['scoreSummary']['derivedPulseRiskLevel']>, string> = {
  low: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  moderate: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  high: 'bg-red-500/10 border-red-500/20 text-red-300',
  critical: 'bg-red-600/15 border-red-500/30 text-red-200',
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return format(new Date(value), 'dd MMM yyyy · HH:mm')
  } catch {
    return '—'
  }
}

function SiteSwitcher({
  sites,
  activeSite,
  onChange,
  badgeCounts,
}: {
  sites: Array<Pick<Site, 'id' | 'name' | 'is_office'>>
  activeSite: string
  onChange: (value: string) => void
  badgeCounts: Record<string, number>
}) {
  return (
    <div className="space-y-2">
      <p className="medic-kicker">Sites</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sites.map((site) => (
          <button
            key={site.id}
            onClick={() => onChange(site.id)}
            className={activeSite === site.id ? 'medic-site-pill-active' : 'medic-site-pill'}
          >
            <span>{site.name}</span>
            {site.is_office && <span className="text-xs opacity-70">(Office)</span>}
            {(badgeCounts[site.id] ?? 0) > 0 && <span className="medic-site-badge">{badgeCounts[site.id]}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="medic-stat-card">
      <p className="text-xs uppercase tracking-[0.22em] text-[var(--medic-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[var(--medic-accent-strong)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--medic-muted)]">{helper}</p>
    </div>
  )
}

function hazardLabels(entry: PsychosocialAssessment) {
  const labelMap = new Map(PSYCHOSOCIAL_HAZARDS.map((hazard) => [hazard.key, hazard.label]))
  return getPsychosocialHazardSignals(entry)
    .slice(0, 4)
    .map((key) => labelMap.get(key) ?? key)
}

function displayWorkerName(entry: PsychosocialAssessment) {
  const trimmed = getPsychosocialWorkerName(entry).trim()
  if (trimmed) return trimmed
  return entry.worker_id ? `Worker ${entry.worker_id.slice(0, 8)}` : 'Unknown worker'
}

interface Props {
  sites: Array<Pick<Site, 'id' | 'name' | 'is_office'>>
  supportCheckIns: PsychosocialAssessment[]
  pulseCount: number
  initialSite?: string
}

export default function PsychosocialDashboard({
  sites,
  supportCheckIns,
  pulseCount,
  initialSite,
}: Props) {
  const [activeSite, setActiveSite] = useState(initialSite || sites[0]?.id || '')

  const siteEntries = useMemo(
    () => supportCheckIns.filter((entry) => entry.site_id === activeSite),
    [supportCheckIns, activeSite],
  )

  const activeEntries = siteEntries.filter((entry) => ACTIVE_STATUSES.includes(entry.status))
  const reviewedEntries = siteEntries.filter((entry) => entry.status === 'resolved').slice(0, 12)

  const badgeCounts = Object.fromEntries(
    sites.map((site) => [
      site.id,
      supportCheckIns.filter((entry) => entry.site_id === site.id && ACTIVE_STATUSES.includes(entry.status)).length,
    ]),
  )

  const queueIds = activeEntries.map((entry) => entry.id)

  return (
    <div className="space-y-6">
      <section className="medic-hero">
        <div className="max-w-3xl">
          <p className="medic-kicker">Psychosocial Cases</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--medic-text)]">Medic and welfare follow-up queue</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--medic-muted)]">
            This queue shows actionable <strong>Support Check-In</strong> cases and medic-led <strong>Post-Incident Welfare</strong> cases. Routine <strong>Wellbeing Pulse</strong> entries remain outside medic review and continue into grouped reporting separately.
          </p>
        </div>
        <div className="medic-summary-pill">{supportCheckIns.length} psychosocial cases on record</div>
      </section>

      <div className="flex justify-end">
        <Link
          href={`/medic/psychosocial/post-incident${activeSite ? `?site=${encodeURIComponent(activeSite)}` : ''}`}
          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
        >
          New post-incident welfare case
        </Link>
      </div>

      <SiteSwitcher sites={sites} activeSite={activeSite} onChange={setActiveSite} badgeCounts={badgeCounts} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting Review" value={siteEntries.filter((entry) => entry.status === 'awaiting_medic_review').length} helper="Ready for medic or welfare triage." />
        <StatCard label="In Review" value={siteEntries.filter((entry) => entry.status === 'in_medic_review').length} helper="Currently opened by a reviewer." />
        <StatCard label="Follow-Up" value={siteEntries.filter((entry) => entry.status === 'awaiting_follow_up').length} helper="Cases with active scheduled follow-up." />
        <StatCard label="Resolved" value={siteEntries.filter((entry) => entry.status === 'resolved').length} helper="Outcome recorded and closed." />
        <StatCard label="Pulse Entries" value={pulseCount} helper="De-identified wellbeing pulses excluded from this queue." />
      </div>

      <section className="medic-panel">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--medic-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--medic-text)]">Active psychosocial queue</h2>
            <p className="mt-1 text-sm text-[var(--medic-muted)]">Support check-ins and post-incident welfare cases. Higher-risk and follow-up cases should be prioritised first.</p>
          </div>
        </div>

        {activeEntries.length === 0 ? (
          <div className="px-5 py-10 text-sm text-[var(--medic-muted)]">No active psychosocial cases at this site.</div>
        ) : (
          <div>
            {activeEntries.map((entry, index) => (
              <Link
                key={entry.id}
                href={`/medic/psychosocial/${entry.id}?${encodeQueue(queueIds, index)}&site=${encodeURIComponent(activeSite)}`}
                className={`medic-queue-link block px-5 py-4 transition-colors hover:bg-[var(--medic-panel-muted)] ${index > 0 ? 'border-t border-[var(--medic-border)]' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="medic-queue-name text-base font-semibold">
                        {displayWorkerName(entry)}
                      </h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[entry.status]}`}>
                        {formatPsychosocialStatus(entry.status)}
                      </span>
                      <span className="rounded-full border border-[var(--medic-border)] bg-[var(--medic-card-soft)] px-2.5 py-1 text-xs font-medium text-[var(--medic-muted)]">
                        {formatPsychosocialWorkflowKind(getPsychosocialWorkflowKind(entry) || 'support_check_in')}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${RISK_STYLES[entry.payload.scoreSummary.derivedPulseRiskLevel]}`}>
                        {formatPsychosocialRiskLevel(entry.payload.scoreSummary.derivedPulseRiskLevel)} risk
                      </span>
                      {entry.payload.scoreSummary.requiresUrgentFollowUp && (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-200">
                          Urgent follow-up
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-[var(--medic-muted)]">
                      {getPsychosocialJobRole(entry) || 'No job role recorded'}
                      {entry.payload.workerPulse?.workgroup ? ` · ${entry.payload.workerPulse.workgroup}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-[var(--medic-muted)]">
                      Submitted {fmtDateTime(entry.submitted_at)} · {entry.payload.postIncidentWelfare ? 'Post-incident welfare case' : entry.payload.scoreSummary.requestedSupport ? 'Worker asked for contact' : 'Support path opened without explicit contact request'}
                    </p>
                    {hazardLabels(entry).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {hazardLabels(entry).map((label) => (
                          <span key={label} className="rounded-full border border-[var(--medic-border)] bg-[var(--medic-card-soft)] px-2.5 py-1 text-xs text-[var(--medic-muted)]">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm text-[var(--medic-muted)]">
                    <p>{entry.review_payload.reviewedByName ? `Reviewer ${entry.review_payload.reviewedByName}` : 'Unclaimed'}</p>
                    <p className="mt-1">{formatPsychosocialAssignedReviewPath(entry.review_payload.assignedReviewPath)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="medic-panel">
        <div className="border-b border-[var(--medic-border)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--medic-text)]">Recently resolved</h2>
          <p className="mt-1 text-sm text-[var(--medic-muted)]">Latest completed psychosocial cases for this site.</p>
        </div>
        {reviewedEntries.length === 0 ? (
          <div className="px-5 py-10 text-sm text-[var(--medic-muted)]">No resolved psychosocial cases yet.</div>
        ) : (
          <div>
            {reviewedEntries.map((entry, index) => (
              <Link
                key={entry.id}
                href={`/medic/psychosocial/${entry.id}?site=${encodeURIComponent(activeSite)}`}
                className={`medic-queue-link block px-5 py-4 transition-colors hover:bg-[var(--medic-panel-muted)] ${index > 0 ? 'border-t border-[var(--medic-border)]' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="medic-queue-name font-medium">{displayWorkerName(entry)}</p>
                    <p className="mt-1 text-sm text-[var(--medic-muted)]">
                      {fmtDateTime(entry.submitted_at)} · {formatPsychosocialWorkflowKind(getPsychosocialWorkflowKind(entry) || 'support_check_in')} · {entry.review_payload.outcomeSummary || 'Outcome recorded'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES.resolved}`}>Resolved</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
