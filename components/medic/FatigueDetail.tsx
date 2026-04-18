'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getExportErrorMessage } from '@/lib/export-feedback'
import type {
  FatigueAssessment,
  FatigueReviewDecision,
  MedicComment,
} from '@/lib/types'
import { encodeQueue } from '@/lib/queue-params'

const DECISIONS: Array<{ value: FatigueReviewDecision; label: string }> = [
  { value: 'fit_normal_duties', label: 'Fit for normal duties' },
  { value: 'fit_restricted_duties', label: 'Fit for restricted duties' },
  { value: 'not_fit_for_work', label: 'Not fit for work' },
  { value: 'sent_to_room', label: 'Sent to room' },
  { value: 'sent_home', label: 'Sent home' },
  { value: 'requires_escalation', label: 'Requires escalation' },
]

const RISK_STYLES = {
  low: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  medium: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  high: 'bg-red-500/10 border-red-500/20 text-red-300',
} as const

const STATUS_STYLES = {
  worker_only_complete: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  awaiting_medic_review: 'bg-violet-500/10 text-violet-300 border border-violet-500/20',
  in_medic_review: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
} as const

const EXPORT_RECOMMENDED_DECISIONS: FatigueReviewDecision[] = [
  'not_fit_for_work',
  'sent_to_room',
  'sent_home',
  'requires_escalation',
]

function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function formatAssessmentContext(value: FatigueAssessment['payload']['workerAssessment']['assessmentContext']) {
  switch (value) {
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

function formatAlertness(value: FatigueAssessment['payload']['workerAssessment']['alertnessRating']) {
  switch (value) {
    case 'a_active_alert_wide_awake':
      return 'A. Active, alert, wide awake'
    case 'b_functioning_well_not_peak':
      return 'B. Functioning well, but not at peak'
    case 'c_ok_but_not_fully_alert':
      return 'C. OK, but not fully alert'
    case 'd_groggy_hard_to_concentrate':
      return 'D. Groggy, hard to concentrate'
    case 'e_sleepy_would_like_to_lie_down':
      return 'E. Sleepy, would like to lie down'
  }
}

function formatAlcoholBand(value: FatigueAssessment['payload']['workerAssessment']['alcoholBeforeSleepBand']) {
  switch (value) {
    case 'none':
      return 'None'
    case 'one_to_two':
      return '1 to 2 standard drinks'
    case 'three_to_four':
      return '3 to 4 standard drinks'
    case 'five_or_more':
      return '5 or more standard drinks'
  }
}

function formatStatus(status: FatigueAssessment['status']) {
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

function formatFatigueDecision(decision: FatigueAssessment['review_payload']['fitForWorkDecision']) {
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 py-2 border-b border-slate-800 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-100">{value}</p>
    </div>
  )
}

interface Props {
  assessment: FatigueAssessment & { comments?: MedicComment[] }
  siteName: string
  businessName: string
  currentUserId: string
  queueContext: { ids: string[]; pos: number } | null
  backHref: string
}

async function getResponseErrorMessage(res: Response, fallback: string): Promise<string> {
  const contentType = res.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => null)
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error
    }
  }

  const text = await res.text().catch(() => '')
  return text || fallback
}

export default function FatigueDetail({ assessment, siteName, businessName, currentUserId, queueContext, backHref }: Props) {
  const router = useRouter()
  const worker = assessment.payload.workerAssessment
  const summary = assessment.payload.workerScoreSummary
  const reviewerName = assessment.review_payload.reviewedByName?.trim() || null
  const reviewerUserId = assessment.review_payload.reviewedByUserId ?? assessment.reviewed_by ?? null
  const isReadOnly =
    assessment.status === 'resolved' ||
    (assessment.status === 'in_medic_review' && reviewerUserId != null && reviewerUserId !== currentUserId)

  const [decision, setDecision] = useState<FatigueReviewDecision | ''>(assessment.review_payload.fitForWorkDecision ?? '')
  const [restrictions, setRestrictions] = useState(assessment.review_payload.restrictions ?? '')
  const [supervisorNotified, setSupervisorNotified] = useState(Boolean(assessment.review_payload.supervisorNotified))
  const [transportArranged, setTransportArranged] = useState(Boolean(assessment.review_payload.transportArranged))
  const [sentToRoom, setSentToRoom] = useState(Boolean(assessment.review_payload.sentToRoom))
  const [sentHome, setSentHome] = useState(Boolean(assessment.review_payload.sentHome))
  const [requiresHigherMedicalReview, setRequiresHigherMedicalReview] = useState(Boolean(assessment.review_payload.requiresHigherMedicalReview))
  const [requiresFollowUp, setRequiresFollowUp] = useState(Boolean(assessment.review_payload.requiresFollowUp))
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [exportedAt, setExportedAt] = useState<string | null>(assessment.exported_at ?? null)
  const [exportConfirmedAt, setExportConfirmedAt] = useState<string | null>(assessment.export_confirmed_at ?? null)
  const [exportConfirming, setExportConfirming] = useState(false)
  const [comments, setComments] = useState<MedicComment[]>(assessment.comments ?? [])
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [commentError, setCommentError] = useState('')

  const prevId = queueContext && queueContext.pos > 0 ? queueContext.ids[queueContext.pos - 1] : null
  const nextId = queueContext && queueContext.pos < queueContext.ids.length - 1 ? queueContext.ids[queueContext.pos + 1] : null

  function queueLink(targetId: string, targetPos: number) {
    if (!queueContext) return `/medic/fatigue/${targetId}`
    return `/medic/fatigue/${targetId}?${encodeQueue(queueContext.ids, targetPos)}&site=${encodeURIComponent(assessment.site_id)}`
  }

  const exportRecommended = !!decision && EXPORT_RECOMMENDED_DECISIONS.includes(decision)
  const isPurged = !!assessment.phi_purged_at
  const requiresExportConfirmation = !!exportedAt && !exportConfirmedAt && !isPurged
  const commentsLocked = isPurged || assessment.status === 'resolved' || !!exportedAt
  const commentLockMessage = isPurged
    ? 'Medical information has been archived; new comments cannot be added.'
    : assessment.status === 'resolved'
      ? 'The PDF is locked to new comments once the fatigue outcome is finalised.'
      : exportedAt
        ? 'The PDF is locked to new comments after export.'
        : ''
  const commentsTitle = useMemo(() => `Medic Comments${comments.length > 0 ? ` (${comments.length})` : ''}`, [comments.length])

  async function exportPdf() {
    setExporting(true)
    try {
      const response = await fetch(`/api/fatigue-assessments/${assessment.id}/pdf`)
      if (!response.ok) {
        setError(await getExportErrorMessage(
          response,
          'The fatigue assessment PDF could not be exported.',
        ))
        return false
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const disposition = response.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      link.href = url
      link.download = match?.[1] || `Fatigue-${assessment.id}.pdf`
      link.click()
      URL.revokeObjectURL(url)
      if (!exportedAt) setExportedAt(new Date().toISOString())
      return true
    } catch {
      setError('Network error. Please try again.')
      return false
    } finally {
      setExporting(false)
    }
  }

  async function handleSave(exportAfterSave = false) {
    if (isReadOnly) {
      setError('This fatigue review is read-only.')
      return
    }

    if (!decision) {
      setError('Please select a fatigue review outcome before saving.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess(false)

    try {
      const response = await fetch(`/api/fatigue-assessments/${assessment.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fitForWorkDecision: decision,
          restrictions: restrictions.trim() || null,
          supervisorNotified,
          transportArranged,
          sentToRoom,
          sentHome,
          requiresHigherMedicalReview,
          requiresFollowUp,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.error || 'Failed to save fatigue review.')
        return
      }

      setSuccess(true)
      if (exportAfterSave) {
        const exported = await exportPdf()
        if (!exported) {
          setError('The fatigue review was saved, but the export did not complete. Please try exporting again.')
        }
        router.refresh()
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddComment() {
    const note = commentDraft.trim()
    if (!note) return
    setCommentSaving(true)
    setCommentError('')
    try {
      const response = await fetch(`/api/fatigue-assessments/${assessment.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, outcome: decision || null }),
      })
      if (!response.ok) {
        setCommentError(await getResponseErrorMessage(response, 'Comment could not be posted. Please try again.'))
        return
      }
      const newComment: MedicComment = await response.json()
      setComments(prev => [...prev, newComment])
      setCommentDraft('')
      router.refresh()
    } catch {
      setCommentError('Network error. Please try again.')
    } finally {
      setCommentSaving(false)
    }
  }

  async function confirmExportAndReturn() {
    if (!requiresExportConfirmation) {
      router.push(backHref)
      return
    }

    const confirmed = window.confirm(
      'Confirm this PDF has been successfully downloaded or saved outside MedGuard. Continuing will permanently remove the stored health information for this fatigue assessment and return you to the list.',
    )
    if (!confirmed) return

    setExportConfirming(true)
    setError('')
    try {
      const res = await fetch('/api/exports/confirm-and-purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType: 'fatigue_assessment',
          id: assessment.id,
          confirmed: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data && typeof data.error === 'string' && data.error) || 'Export confirmation failed. Please try again.')
        return
      }

      setExportConfirmedAt(new Date().toISOString())
      router.push(backHref)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setExportConfirming(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700/50 gap-4 flex-wrap">
        {requiresExportConfirmation ? (
          <button
            onClick={confirmExportAndReturn}
            disabled={exportConfirming}
            className="flex items-center gap-1.5 text-sm text-amber-300 hover:text-amber-200 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {exportConfirming ? 'Removing PHI…' : 'Back to Fatigue Queue and remove PHI'}
          </button>
        ) : (
          <Link href={backHref} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Fatigue Queue
          </Link>
        )}
        {queueContext && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{queueContext.pos + 1} of {queueContext.ids.length} pending</span>
            <div className="flex items-center gap-1">
              {prevId ? <Link href={queueLink(prevId, queueContext.pos - 1)} className="px-3 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 rounded-lg transition-colors">← Prev</Link> : <span className="px-3 py-1.5 text-xs font-medium bg-slate-800/40 border border-slate-700/40 text-slate-600 rounded-lg">← Prev</span>}
              {nextId ? <Link href={queueLink(nextId, queueContext.pos + 1)} className="px-3 py-1.5 text-xs font-medium bg-violet-500/10 border border-violet-500/25 text-violet-300 hover:bg-violet-500/15 rounded-lg transition-colors">Next →</Link> : <span className="px-3 py-1.5 text-xs font-medium bg-slate-800/40 border border-slate-700/40 text-slate-600 rounded-lg">Next →</span>}
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-5 py-4 mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{worker.workerNameSnapshot || 'Fatigue Assessment'}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {worker.jobRole || 'Unknown role'} · {siteName} · {businessName}
          </p>
          <p className="text-xs text-slate-600 mt-1">Submitted {fmtDateTime(assessment.submitted_at)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${RISK_STYLES[summary.derivedRiskLevel]}`}>
            {summary.derivedRiskLevel.toUpperCase()} RISK
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[assessment.status]}`}>
            {formatStatus(assessment.status)}
          </span>
        </div>
      </div>

      <div className={`mb-4 rounded-xl border p-4 ${RISK_STYLES[summary.derivedRiskLevel]}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">Fatigue Risk Summary</p>
            <h2 className="mt-1 text-lg font-bold">
              {summary.derivedRiskLevel.toUpperCase()} RISK · Score {summary.fatigueScoreTotal}
            </h2>
            <p className="mt-1 text-sm opacity-90">
              {summary.hasAnyHighRiskAnswer
                ? 'At least one high-risk answer was recorded in this self-assessment.'
                : 'The derived risk comes from the combined fatigue score and supporting factors.'}
            </p>
          </div>
        <div className="rounded-lg border border-current/20 bg-black/10 px-3 py-2 text-sm">
          <p className="font-semibold">{formatStatus(assessment.status)}</p>
          <p className="opacity-80">Submitted {fmtDateTime(assessment.submitted_at)}</p>
          {reviewerName && <p className="opacity-80">Reviewer {reviewerName}</p>}
        </div>
      </div>
    </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Worker Assessment</h2>
            <InfoRow label="Assessment context" value={formatAssessmentContext(worker.assessmentContext)} />
            <InfoRow label="Job role" value={worker.jobRole || '—'} />
            <InfoRow label="Workgroup" value={worker.workgroup || '—'} />
            <InfoRow label="Roster" value={worker.rosterPattern || '—'} />
            <InfoRow label="Current shift start" value={fmtDateTime(worker.currentShiftStartAt)} />
            <InfoRow label="Planned shift end" value={fmtDateTime(worker.plannedShiftEndAt)} />
            <InfoRow label="Sleep last 24h" value={`${worker.sleepHoursLast24h} hours`} />
            <InfoRow label="Sleep last 48h" value={`${worker.sleepHoursLast48h} hours`} />
            <InfoRow label="Hours awake by end of shift" value={`${worker.hoursAwakeByEndOfShift} hours`} />
            <InfoRow label="Alertness rating" value={formatAlertness(worker.alertnessRating)} />
            <InfoRow label="Alcohol before sleep" value={formatAlcoholBand(worker.alcoholBeforeSleepBand)} />
            <InfoRow label="Drowsy medication / substance" value={worker.drowsyMedicationOrSubstance ? 'Yes' : 'No'} />
            <InfoRow label="Stress / health issue affecting concentration" value={worker.stressOrHealthIssueAffectingSleepOrConcentration ? 'Yes' : 'No'} />
            <InfoRow label="Driving after shift" value={worker.drivingAfterShift ? 'Yes' : 'No'} />
            <InfoRow label="Commute duration" value={worker.commuteDurationMinutes ? `${worker.commuteDurationMinutes} minutes` : '—'} />
            <InfoRow label="Worker comments" value={worker.workerComments || '—'} />
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Score Summary</h2>
            <InfoRow label="Fatigue score" value={String(summary.fatigueScoreTotal)} />
            <InfoRow label="Derived risk level" value={summary.derivedRiskLevel.toUpperCase()} />
            <InfoRow label="Any high-risk response" value={summary.hasAnyHighRiskAnswer ? 'Yes' : 'No'} />
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Medic Outcome</h2>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Decision</span>
                <select
                  value={decision}
                  onChange={(event) => setDecision(event.target.value as FatigueReviewDecision)}
                  disabled={isReadOnly}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 disabled:opacity-60"
                >
                  <option value="">Select outcome</option>
                  {DECISIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Restrictions</span>
                <textarea value={restrictions} onChange={(event) => setRestrictions(event.target.value)} rows={3} disabled={isReadOnly} className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 disabled:opacity-60" />
              </label>

              <div className="space-y-2 rounded-lg border border-slate-700/60 bg-slate-900/30 p-3">
                {[
                  ['Supervisor notified', supervisorNotified, setSupervisorNotified],
                  ['Transport arranged', transportArranged, setTransportArranged],
                  ['Sent to room', sentToRoom, setSentToRoom],
                  ['Sent home', sentHome, setSentHome],
                  ['Requires higher medical review', requiresHigherMedicalReview, setRequiresHigherMedicalReview],
                  ['Requires follow-up', requiresFollowUp, setRequiresFollowUp],
                ].map(([label, value, setter]) => (
                  <label key={label as string} className="flex items-center gap-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      disabled={isReadOnly}
                      onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-violet-500 focus:ring-violet-500 disabled:opacity-60"
                    />
                    <span>{label as string}</span>
                  </label>
                ))}
              </div>

              {exportRecommended && !exportedAt && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-sm font-semibold text-amber-300">Export recommended</p>
                  <p className="mt-1 text-xs text-amber-200/90">
                    This outcome should usually be exported into the business medical record for follow-up, handover, and governance.
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-red-300">{error}</p>}
              {success && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
                  <p className="font-semibold">Fatigue review saved.</p>
                  <p className="mt-1 text-emerald-300/90">
                    This assessment now moves out of the active queue and into the recently reviewed list for the site.
                  </p>
                </div>
              )}

              {isReadOnly ? (
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 px-3 py-3 text-sm text-slate-300">
                  <p className="font-semibold text-slate-100">
                    {assessment.status === 'resolved'
                      ? 'This fatigue review has been finalised.'
                      : 'Another medic has already claimed this fatigue review.'}
                  </p>
                  <p className="mt-1 text-slate-400">
                    {reviewerName
                      ? `Reviewer: ${reviewerName}. Comments and outcome are now read-only.`
                      : 'Comments and outcome are now read-only.'}
                  </p>
                </div>
              ) : exportRecommended && !exportedAt ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving || exporting}
                    className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Complete without export'}
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving || exporting}
                    className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving || exporting ? 'Completing...' : 'Complete and export'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving || exporting}
                  className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save fatigue review'}
                </button>
              )}

              {assessment.status === 'resolved' && (
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 px-3 py-3 text-sm text-slate-300">
                  <p className="font-semibold text-slate-100">Current recorded outcome</p>
                  <p className="mt-1">{formatFatigueDecision(assessment.review_payload.fitForWorkDecision)}</p>
                  {reviewerName && <p className="mt-1 text-slate-400">Reviewed by {reviewerName}</p>}
                  <p className="mt-1 text-slate-400">
                    {[
                      assessment.review_payload.supervisorNotified ? 'Supervisor notified' : null,
                      assessment.review_payload.transportArranged ? 'Transport arranged' : null,
                      assessment.review_payload.sentToRoom ? 'Sent to room' : null,
                      assessment.review_payload.sentHome ? 'Sent home' : null,
                      assessment.review_payload.requiresHigherMedicalReview ? 'Escalated for higher review' : null,
                      assessment.review_payload.requiresFollowUp ? 'Follow-up required' : null,
                    ].filter(Boolean).join(' · ') || 'No extra follow-up flags recorded'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">{commentsTitle}</h2>

            {comments.length === 0 && (
              <p className="text-sm text-slate-500 mb-5">No comments yet.</p>
            )}

            {comments.length > 0 && (
              <div className="space-y-4 mb-6">
                {comments.map((comment) => {
                  const isOwn = comment.medic_user_id === currentUserId
                  return (
                    <div key={comment.id} className="border border-slate-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${isOwn ? 'text-violet-300' : 'text-slate-300'}`}>
                            {comment.medic_name}
                          </span>
                          {isOwn && <span className="text-xs text-slate-600">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500" suppressHydrationWarning>
                          {fmtDateTime(comment.created_at)}
                        </div>
                      </div>
                      <p className="text-sm text-slate-200 whitespace-pre-wrap">{comment.note}</p>
                      {isOwn && <p className="mt-2 text-xs text-slate-500">Saved as part of the clinical audit trail.</p>}
                    </div>
                  )
                })}
              </div>
            )}

            {commentsLocked ? (
              <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-4 py-3">
                <p className="text-sm font-medium text-slate-300">Comments locked</p>
                <p className="mt-1 text-xs text-slate-500">{commentLockMessage}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Notes are append-only once posted so the review history stays intact.
                </p>
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Add a comment…"
                  rows={3}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                />
                {commentError && <p className="text-xs text-red-400">{commentError}</p>}
                <button
                  onClick={handleAddComment}
                  disabled={commentSaving || !commentDraft.trim()}
                  className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
                >
                  {commentSaving ? 'Posting…' : 'Post Comment'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Export &amp; Audit</h2>
            <div className="text-sm text-slate-400 space-y-1 mb-4">
              {exportedAt ? (
                <p>Exported: <span className="text-slate-300">{fmtDateTime(exportedAt)}</span></p>
              ) : (
                <p className="text-slate-500 italic">Not yet exported</p>
              )}
            </div>
            {requiresExportConfirmation && !error && (
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Export confirmation required</p>
                <p className="mt-2 text-sm text-amber-100" suppressHydrationWarning>
                  Exported {fmtDateTime(exportedAt)}. Make sure the PDF has been successfully downloaded or saved outside MedGuard.
                </p>
                <p className="mt-2 text-xs text-amber-200/90">
                  When you return to the fatigue queue, MedGuard will remove the stored health information for this assessment. If the file did not save correctly, download it again before leaving this page.
                </p>
              </div>
            )}
            <button
              onClick={async () => {
                const exported = await exportPdf()
                if (exported) router.refresh()
              }}
              disabled={exporting}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 disabled:opacity-60"
            >
              {exporting ? 'Generating...' : exportedAt ? 'Download PDF Again' : 'Export PDF'}
            </button>
            {requiresExportConfirmation && (
              <button
                onClick={confirmExportAndReturn}
                disabled={exportConfirming}
                className="mt-3 w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15 disabled:opacity-60"
              >
                {exportConfirming ? 'Removing PHI…' : 'Back to Fatigue Queue and remove PHI'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
