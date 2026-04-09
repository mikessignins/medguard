'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getExportErrorMessage } from '@/lib/export-feedback'
import {
  formatPsychosocialAssignedReviewPath,
  formatPsychosocialContactOutcome,
  formatPsychosocialContext,
  formatPsychosocialPostIncidentEventType,
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
import type { PsychosocialAssessment, PsychosocialReviewEntry } from '@/lib/types'

const STATUS_STYLES = {
  worker_only_complete: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  review_recommended: 'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  awaiting_medic_review: 'bg-violet-500/10 text-violet-300 border border-violet-500/20',
  in_medic_review: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  awaiting_follow_up: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
} as const

const RISK_STYLES = {
  low: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  moderate: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  high: 'bg-red-500/10 border-red-500/20 text-red-300',
  critical: 'bg-red-600/15 border-red-500/30 text-red-200',
} as const

const TRIAGE_PRIORITIES = [
  ['routine', 'Routine'],
  ['priority', 'Priority'],
  ['urgent', 'Urgent'],
] as const

const REVIEW_PATHS = [
  ['medic', 'Medic'],
  ['welfare_or_counsellor', 'Welfare or counsellor'],
  ['either', 'Either'],
  ['external_provider', 'External provider'],
] as const

const CONTACT_OUTCOMES = [
  ['not_contacted_yet', 'Not contacted yet'],
  ['contact_attempted', 'Contact attempted'],
  ['contact_completed', 'Contact completed'],
  ['worker_declined', 'Worker declined'],
  ['referred', 'Referred'],
  ['monitor_only', 'Monitor only'],
] as const

const CLOSURE_REASONS = [
  ['support_provided', 'Support provided'],
  ['monitoring_complete', 'Monitoring complete'],
  ['referred_to_eap', 'Referred to EAP'],
  ['referred_to_external_psychology', 'Referred to external psychology'],
  ['worker_declined_support', 'Worker declined support'],
  ['other', 'Other'],
] as const

function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[190px_1fr] gap-3 border-b border-slate-800 py-2 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-100">{value}</p>
    </div>
  )
}

function reviewHistory(assessment: PsychosocialAssessment) {
  const entries = Array.isArray(assessment.review_payload.reviewEntries)
    ? assessment.review_payload.reviewEntries
    : []

  if (entries.length > 0) return entries

  if (assessment.review_payload.reviewComments?.trim()) {
    return [{
      id: 'legacy-review-comment',
      createdAt: assessment.reviewed_at ?? assessment.submitted_at,
      createdByUserId: assessment.reviewed_by ?? 'legacy',
      createdByName: assessment.review_payload.reviewedByName ?? 'Previous reviewer',
      actionLabel: assessment.review_payload.supportActions ?? null,
      note: assessment.review_payload.reviewComments,
    } satisfies PsychosocialReviewEntry]
  }

  return []
}

function formatScaleValue(kind: 'mood' | 'stress' | 'sleep', value: number) {
  if (kind === 'mood') {
    return ['Very low', 'Low', 'Mixed', 'Good', 'Very good'][Math.max(0, Math.min(4, value - 1))] + ` (${value}/5)`
  }
  if (kind === 'stress') {
    return ['Very low', 'Low', 'Moderate', 'High', 'Very high'][Math.max(0, Math.min(4, value - 1))] + ` (${value}/5)`
  }
  return ['Very poor', 'Poor', 'Fair', 'Good', 'Very good'][Math.max(0, Math.min(4, value - 1))] + ` (${value}/5)`
}

interface Props {
  assessment: PsychosocialAssessment
  siteName: string
  businessName: string
  currentUserId: string
  queueContext: { ids: string[]; pos: number } | null
  backHref: string
}

export default function PsychosocialDetail({
  assessment,
  siteName,
  businessName,
  currentUserId,
  queueContext,
  backHref,
}: Props) {
  const router = useRouter()
  const worker = assessment.payload.workerPulse ?? null
  const welfare = assessment.payload.postIncidentWelfare ?? null
  const summary = assessment.payload.scoreSummary
  const workflowKind = getPsychosocialWorkflowKind(assessment) || 'support_check_in'
  const workerName = getPsychosocialWorkerName(assessment)
  const jobRole = getPsychosocialJobRole(assessment)
  const reviewerName = assessment.review_payload.reviewedByName?.trim() || null
  const reviewerUserId = assessment.review_payload.caseOwnerUserId ?? assessment.review_payload.reviewedByUserId ?? assessment.reviewed_by ?? null
  const isReadOnly =
    assessment.status === 'resolved' ||
    ((assessment.status === 'in_medic_review' || assessment.status === 'awaiting_follow_up') && reviewerUserId != null && reviewerUserId !== currentUserId)

  const [outcomeSummary, setOutcomeSummary] = useState(assessment.review_payload.outcomeSummary ?? '')
  const [supportActions, setSupportActions] = useState(assessment.review_payload.supportActions ?? '')
  const [newReviewComment, setNewReviewComment] = useState('')
  const [followUpRequired, setFollowUpRequired] = useState(Boolean(assessment.review_payload.followUpRequired))
  const [triagePriority, setTriagePriority] = useState(assessment.review_payload.triagePriority ?? 'routine')
  const [assignedReviewPath, setAssignedReviewPath] = useState(assessment.review_payload.assignedReviewPath ?? 'medic')
  const [contactOutcome, setContactOutcome] = useState(assessment.review_payload.contactOutcome ?? 'not_contacted_yet')
  const [supportPersonContacted, setSupportPersonContacted] = useState(Boolean(assessment.review_payload.supportPersonContacted ?? welfare?.supportPersonContacted))
  const [eapReferralOffered, setEapReferralOffered] = useState(Boolean(assessment.review_payload.eapReferralOffered ?? welfare?.eapReferralOffered))
  const [externalPsychologyReferralOffered, setExternalPsychologyReferralOffered] = useState(Boolean(assessment.review_payload.externalPsychologyReferralOffered ?? welfare?.externalPsychologyReferralOffered))
  const [followUpScheduledAt, setFollowUpScheduledAt] = useState(assessment.review_payload.followUpScheduledAt ?? welfare?.followUpScheduledAt ?? '')
  const [closureReason, setClosureReason] = useState(assessment.review_payload.closureReason ?? 'support_provided')
  const [nextStatus, setNextStatus] = useState<'awaiting_follow_up' | 'resolved'>(assessment.status === 'awaiting_follow_up' ? 'awaiting_follow_up' : 'resolved')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [exportedAt, setExportedAt] = useState<string | null>(assessment.exported_at ?? null)
  const history = reviewHistory(assessment)

  const hazardLabels = getPsychosocialHazardSignals(assessment)
    .map((key) => PSYCHOSOCIAL_HAZARDS.find((hazard) => hazard.key === key)?.label ?? key)

  const prevId = queueContext && queueContext.pos > 0 ? queueContext.ids[queueContext.pos - 1] : null
  const nextId = queueContext && queueContext.pos < queueContext.ids.length - 1 ? queueContext.ids[queueContext.pos + 1] : null

  function queueLink(targetId: string, targetPos: number) {
    if (!queueContext) return `/medic/psychosocial/${targetId}`
    return `/medic/psychosocial/${targetId}?${encodeQueue(queueContext.ids, targetPos)}&site=${encodeURIComponent(assessment.site_id)}`
  }

  async function handleSave() {
    if (isReadOnly) {
      setError('This psychosocial support review is read-only.')
      return
    }

    if (!outcomeSummary.trim()) {
      setError('Please enter an outcome summary before saving.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess(false)

    try {
      const response = await fetch(`/api/psychosocial-assessments/${assessment.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextStatus,
          triagePriority,
          assignedReviewPath,
          contactOutcome,
          supportPersonContacted,
          eapReferralOffered,
          externalPsychologyReferralOffered,
          followUpScheduledAt: followUpScheduledAt || null,
          closureReason: nextStatus === 'resolved' ? closureReason : null,
          outcomeSummary: outcomeSummary.trim(),
          supportActions: supportActions.trim() || null,
          followUpRequired: nextStatus === 'awaiting_follow_up' ? true : followUpRequired,
          reviewComments: newReviewComment.trim() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.error || 'Failed to save psychosocial review.')
        return
      }

      setSuccess(true)
      setNewReviewComment('')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function exportPdf() {
    setExporting(true)
    setError('')
    try {
      const response = await fetch(`/api/psychosocial-assessments/${assessment.id}/pdf`)
      if (!response.ok) {
        setError(await getExportErrorMessage(
          response,
          'The psychosocial support PDF could not be exported.',
        ))
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const disposition = response.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      link.href = url
      link.download = match?.[1] || `Psychosocial-${assessment.id}.pdf`
      link.click()
      URL.revokeObjectURL(url)
      if (!exportedAt) setExportedAt(new Date().toISOString())
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={backHref} className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200">
          Back to psychosocial queue
        </Link>
        <div className="flex items-center gap-2">
          {prevId && (
            <Link href={queueLink(prevId, queueContext!.pos - 1)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800">
              Previous
            </Link>
          )}
          {nextId && (
            <Link href={queueLink(nextId, queueContext!.pos + 1)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800">
              Next
            </Link>
          )}
        </div>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{formatPsychosocialWorkflowKind(workflowKind)}</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">{workerName}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {jobRole || 'No job role recorded'}
              {worker?.workgroup ? ` · ${worker.workgroup}` : ''}
              {worker?.rosterPattern ? ` · ${worker.rosterPattern}` : ''}
            </p>
            <p className="mt-1 text-sm text-slate-500">{siteName} · {businessName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[assessment.status]}`}>
              {formatPsychosocialStatus(assessment.status)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${RISK_STYLES[summary.derivedPulseRiskLevel]}`}>
              {formatPsychosocialRiskLevel(summary.derivedPulseRiskLevel)} risk
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-200">
              {workflowKind === 'post_incident_psychological_welfare' ? 'Post-incident event details' : 'Worker context and responses'}
            </h2>
            <div className="mt-4">
              <InfoRow label="Submitted" value={fmtDateTime(assessment.submitted_at)} />
              {worker ? (
                <>
                  <InfoRow label="Context" value={formatPsychosocialContext(worker.submissionContext)} />
                  <InfoRow label="Mood" value={formatScaleValue('mood', worker.moodRating)} />
                  <InfoRow label="Stress" value={formatScaleValue('stress', worker.stressRating)} />
                  <InfoRow label="Sleep quality" value={formatScaleValue('sleep', worker.sleepQualityOnRoster)} />
                  <InfoRow label="Support requested" value={summary.requestedSupport ? 'Yes' : 'No'} />
                  <InfoRow label="Urgent contact today" value={worker.wouldLikeUrgentContactToday ? 'Yes' : 'No'} />
                  <InfoRow label="Unsafe at work today" value={worker.feelsUnsafeAtWorkToday ? 'Yes' : 'No'} />
                  <InfoRow label="Comfort speaking to medic" value={worker.comfortableSpeakingToMedic ? 'Yes' : 'No'} />
                  <InfoRow label="Comfort speaking to counsellor" value={worker.comfortableSpeakingToCounsellor ? 'Yes' : 'No'} />
                  <InfoRow label="Comments" value={worker.workerComments?.trim() || '—'} />
                </>
              ) : welfare ? (
                <>
                  <InfoRow label="Event type" value={formatPsychosocialPostIncidentEventType(welfare.eventType)} />
                  <InfoRow label="Event date and time" value={fmtDateTime(welfare.eventDateTime)} />
                  <InfoRow label="Linked incident ID" value={welfare.linkedIncidentOrCaseId || '—'} />
                  <InfoRow label="Nature of exposure" value={welfare.natureOfExposure} />
                  <InfoRow label="Initial defusing offered" value={welfare.initialDefusingOffered ? 'Yes' : 'No'} />
                  <InfoRow label="Normal reactions explained" value={welfare.normalReactionsExplained ? 'Yes' : 'No'} />
                  <InfoRow label="Confidentiality acknowledged" value={welfare.confidentialityAcknowledged ? 'Yes' : 'No'} />
                  <InfoRow label="Initial notes" value={welfare.reviewNotes?.trim() || '—'} />
                </>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-200">{workflowKind === 'post_incident_psychological_welfare' ? 'Case management summary' : 'Hazard signals'}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {workflowKind === 'post_incident_psychological_welfare'
                ? 'This welfare case remains identifiable for operational follow-up, while aggregate counts can still feed de-identified reporting.'
                : 'These grouped signals should also feed de-identified business reporting after aggregation.'}
            </p>
            {hazardLabels.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No mapped hazard signals were raised above the current threshold.</p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {hazardLabels.map((label) => (
                  <span key={label} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">
                    {label}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
              <p className="font-medium text-slate-100">Reviewer</p>
              <p className="mt-1">{reviewerName || 'Not yet assigned'}</p>
              <p className="mt-3 font-medium text-slate-100">Review started</p>
              <p className="mt-1">{fmtDateTime(assessment.review_payload.reviewStartedAt ?? assessment.reviewed_at)}</p>
              <p className="mt-3 font-medium text-slate-100">Assigned review path</p>
              <p className="mt-1">{formatPsychosocialAssignedReviewPath(assessment.review_payload.assignedReviewPath)}</p>
              <p className="mt-3 font-medium text-slate-100">Current contact outcome</p>
              <p className="mt-1">{formatPsychosocialContactOutcome(assessment.review_payload.contactOutcome)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Case review and follow-up</h2>
            <p className="mt-2 text-sm text-slate-500">Record triage, contact outcome, referrals, and follow-up. Saved comments are locked as part of the psychosocial audit trail.</p>
          </div>
          {isReadOnly && (
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300">
              {assessment.status === 'resolved' ? 'Review completed' : 'Claimed by another reviewer'}
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Triage priority</span>
              <select value={triagePriority} onChange={(event) => setTriagePriority(event.target.value as typeof triagePriority)} disabled={isReadOnly} className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100">
                {TRIAGE_PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Assigned review path</span>
              <select value={assignedReviewPath} onChange={(event) => setAssignedReviewPath(event.target.value as typeof assignedReviewPath)} disabled={isReadOnly} className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100">
                {REVIEW_PATHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Contact outcome</span>
              <select value={contactOutcome} onChange={(event) => setContactOutcome(event.target.value as typeof contactOutcome)} disabled={isReadOnly} className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100">
                {CONTACT_OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Follow-up scheduled at</span>
              <input type="datetime-local" value={followUpScheduledAt} onChange={(event) => setFollowUpScheduledAt(event.target.value)} readOnly={isReadOnly} className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50" />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">Outcome summary</span>
            <textarea
              value={outcomeSummary}
              onChange={(event) => setOutcomeSummary(event.target.value)}
              rows={3}
              readOnly={isReadOnly}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50"
              placeholder="Briefly capture the review outcome."
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">Support actions</span>
            <textarea
              value={supportActions}
              onChange={(event) => setSupportActions(event.target.value)}
              rows={4}
              readOnly={isReadOnly}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50"
              placeholder="What contact, advice, referral, or welfare actions were taken?"
            />
          </label>

          <div className="space-y-3">
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-200">Saved review comments</span>
              {history.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-500">
                  No saved psychosocial review comments yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                      <p className="text-sm font-medium text-slate-100">
                        {[entry.actionLabel, entry.createdByName].filter(Boolean).join(' · ') || 'Review update'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{fmtDateTime(entry.createdAt)}</p>
                      <p className="mt-2 text-sm text-slate-300">{entry.note?.trim() || 'No comment recorded.'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Add new review comment</span>
              <textarea
                value={newReviewComment}
                onChange={(event) => setNewReviewComment(event.target.value)}
                rows={4}
                readOnly={isReadOnly}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50"
                placeholder="Add a new psychosocial review note. Existing comments cannot be edited."
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={followUpRequired}
              onChange={(event) => setFollowUpRequired(event.target.checked)}
              disabled={isReadOnly}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
            />
            Follow-up is still required after this review
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Support person contacted', supportPersonContacted, setSupportPersonContacted],
              ['EAP referral offered', eapReferralOffered, setEapReferralOffered],
              ['External psychology referral offered', externalPsychologyReferralOffered, setExternalPsychologyReferralOffered],
            ].map(([label, value, setter]) => (
              <label key={label as string} className="inline-flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={value as boolean} onChange={(event) => (setter as (v: boolean) => void)(event.target.checked)} disabled={isReadOnly} className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500" />
                {label as string}
              </label>
            ))}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Next case status</span>
              <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as 'awaiting_follow_up' | 'resolved')} disabled={isReadOnly} className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100">
                <option value="awaiting_follow_up">Keep open for follow-up</option>
                <option value="resolved">Resolve case</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Closure reason</span>
              <select value={closureReason} onChange={(event) => setClosureReason(event.target.value as typeof closureReason)} disabled={isReadOnly || nextStatus !== 'resolved'} className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100">
                {CLOSURE_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-300">Psychosocial case updated.</p>}
          {exportedAt && <p className="text-sm text-slate-400">Exported {fmtDateTime(exportedAt)}</p>}

          <div className="flex items-center justify-end gap-3">
            <Link href={backHref} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800">
              Back
            </Link>
            {assessment.status === 'resolved' && (
              <button
                type="button"
                onClick={exportPdf}
                disabled={exporting}
                className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : exportedAt ? 'Re-export PDF' : 'Export PDF'}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isReadOnly}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Updating...' : 'Update psychosocial case'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
