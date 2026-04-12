'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getExportErrorMessage } from '@/lib/export-feedback'
import { encodeQueue } from '@/lib/queue-params'
import type { WorkerSnapshot, Decision, SubmissionStatus, ScriptUpload, MedicComment } from '@/lib/types'

const FLAGGED_REVIEWS = [
  'Opioid', 'Benzodiazepine', 'Antipsychotic', 'Anticoagulant',
  'Insulin / Diabetes', 'Antiepileptic', 'Sedative / Hypnotic',
  'Stimulant', 'Review Required',
]

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  'New': 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Approved': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Requires Follow-up': 'bg-red-500/10 text-red-400 border border-red-500/20',
  'Recalled': 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
}

const DRAFT_TTL_MS = 12 * 60 * 60 * 1000

// All date formatting done here — never inline — to avoid hydration mismatches
function fmt(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', opts)
  } catch {
    return '—'
  }
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

interface SafeSubmission {
  id: string
  business_id: string
  site_id: string
  worker_id: string
  role: string
  visit_date: string | null
  shift_type: string
  status: SubmissionStatus
  consent_given: boolean
  submitted_at: string | null
  site_specific_answers: Record<string, string>
  exported_at: string | null
  phi_purged_at: string | null
  worker_snapshot: WorkerSnapshot | null
  decision: Decision | null
  scriptUploads: ScriptUpload[]
  comments: MedicComment[]
}

function formatEmergencyFieldLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

interface Props {
  submission: SafeSubmission
  siteName: string
  businessName: string
  currentUserId: string
  queueContext: { ids: string[]; pos: number } | null
  backHref?: string
}

function buildPdfFilename(
  ws: WorkerSnapshot | null,
  siteName: string,
  businessName: string,
  visitDate: string | null,
): string {
  const fullName = ws?.fullName?.trim() || 'Unknown Worker'
  const nameParts = fullName.split(/\s+/)
  const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullName
  const firstname = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const nameStr = firstname ? `${surname} ${firstname}` : surname

  const dob = ws?.dateOfBirth ? ws.dateOfBirth.slice(0, 10) : 'unknown'
  const submDate = visitDate ? visitDate.slice(0, 10) : new Date().toISOString().slice(0, 10)

  const clean = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '-').trim()
  return `${clean(nameStr)} - ${dob} - ${clean(siteName)} - ${clean(businessName)} - ${submDate}`
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 pb-2 border-b border-slate-700/50">
      {title}
    </h3>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display = value === true ? 'Yes' : value === false ? 'No' : (value ?? '—') || '—'
  return (
    <div className="flex gap-4 py-2 border-b border-slate-700/30">
      <span className="text-sm text-slate-500 w-44 shrink-0">{label}</span>
      <span className="text-sm text-slate-100 font-medium">{display}</span>
    </div>
  )
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

export default function SubmissionDetail({ submission, siteName, businessName, currentUserId, queueContext, backHref }: Props) {
  const router = useRouter()

  const [status, setStatus] = useState<SubmissionStatus>(submission.status)
  const [decision, setDecision] = useState<Decision | null>(submission.decision)
  const [loading, setLoading] = useState(false)
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpNote, setFollowUpNote] = useState('')
  const [actionError, setActionError] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [exportedAt, setExportedAt] = useState<string | null>(submission.exported_at)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')

  // Comments
  const [comments, setComments] = useState<MedicComment[]>(submission.comments)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [commentError, setCommentError] = useState('')
  const draftStorageKey = useMemo(
    () => `medic-submission-draft:${currentUserId}:${submission.id}`,
    [currentUserId, submission.id],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const legacyDraftKey = `medic-submission-draft:${submission.id}`
    window.localStorage.removeItem(legacyDraftKey)

    const raw = window.sessionStorage.getItem(draftStorageKey)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as {
        commentDraft?: string
        followUpNote?: string
        savedAt?: number
      }
      if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
        window.sessionStorage.removeItem(draftStorageKey)
        return
      }
      setCommentDraft(typeof parsed.commentDraft === 'string' ? parsed.commentDraft : '')
      setFollowUpNote(typeof parsed.followUpNote === 'string' ? parsed.followUpNote : '')
    } catch {
      window.sessionStorage.removeItem(draftStorageKey)
    }
  }, [draftStorageKey, submission.id])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hasDraft = commentDraft.trim().length > 0 || followUpNote.trim().length > 0
    if (!hasDraft) {
      window.sessionStorage.removeItem(draftStorageKey)
      return
    }

    window.sessionStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        commentDraft,
        followUpNote,
        savedAt: Date.now(),
      }),
    )
  }, [commentDraft, draftStorageKey, followUpNote])

  async function handleAddComment() {
    const note = commentDraft.trim()
    if (!note) return
    setCommentSaving(true)
    setCommentError('')
    try {
      const res = await fetch(`/api/declarations/${submission.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      if (!res.ok) {
        setCommentError(await getResponseErrorMessage(res, 'Comment could not be posted. Please try again.'))
        return
      }
      const newComment: MedicComment = await res.json()
      setComments(prev => [...prev, newComment])
      setCommentDraft('')
      if (!followUpNote.trim()) {
        window.sessionStorage.removeItem(draftStorageKey)
      }
    } catch {
      setCommentError('Network error — please try again.')
    } finally {
      setCommentSaving(false)
    }
  }

  const ws = submission.worker_snapshot
  const isPurged = !!submission.phi_purged_at
  const hasSnapshot = !!ws && typeof ws === 'object'
  const isDecisionLocked = status === 'Approved' || status === 'Requires Follow-up'
  const areCommentsLocked = isPurged || status === 'Approved' || !!exportedAt
  const commentLockMessage = isPurged
    ? 'Medical information has been archived; new comments cannot be added.'
    : status === 'Approved'
      ? 'The PDF is locked to new comments now that it is approved.'
      : exportedAt
        ? 'The PDF is locked to new comments after export.'
        : ''

  const conditionFlags = hasSnapshot && ws.conditionChecklist
    ? Object.entries(ws.conditionChecklist).filter(([, v]) => v?.answer === true)
    : []

  const medications = hasSnapshot ? (ws.currentMedications || []) : []
  const hasFlaggedMeds = medications.some(m => FLAGGED_REVIEWS.includes(m?.reviewFlag ?? ''))
  const extraEmergencyAnswers = Object.entries(submission.site_specific_answers ?? {})
    .filter(([key, value]) => key.trim().length > 0 && String(value).trim().length > 0)

  const prevId = queueContext && queueContext.pos > 0 ? queueContext.ids[queueContext.pos - 1] : null
  const nextId = queueContext && queueContext.pos < queueContext.ids.length - 1 ? queueContext.ids[queueContext.pos + 1] : null

  function queueLink(targetId: string, targetPos: number) {
    if (!queueContext) return `/medic/submissions/${targetId}`
    return `/medic/submissions/${targetId}?${encodeQueue(queueContext.ids, targetPos)}`
  }

  async function updateStatus(newStatus: SubmissionStatus, note?: string) {
    setLoading(true)
    setActionError('')
    try {
      const res = await fetch(`/api/declarations/${submission.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error || 'Failed to update submission status')
        return
      }

      setStatus(newStatus)
      if (newStatus === 'Approved' || newStatus === 'Requires Follow-up') {
        setDecision({
          outcome: newStatus,
          note: note?.trim() || undefined,
          decided_by_user_id: currentUserId,
          decided_by_name: decision?.decided_by_name || undefined,
          decided_at: new Date().toISOString(),
        })
      }
      setShowFollowUpModal(false)
      setFollowUpNote('')
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(draftStorageKey)
      }
      router.refresh()
    } catch {
      setActionError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleExportPdf() {
    setPdfLoading(true)
    setPdfError('')
    try {
      const res = await fetch(`/api/declarations/${submission.id}/pdf`)
      if (!res.ok) {
        setPdfError(await getExportErrorMessage(
          res,
          'The declaration PDF could not be exported.',
        ))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      // Prefer the filename from Content-Disposition if the browser surfaces it
      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      a.download = match ? match[1] : buildPdfFilename(ws, siteName, businessName, submission.visit_date) + '.pdf'
      a.href = url
      a.click()
      URL.revokeObjectURL(url)
      // The route handler updates exported_at server-side; reflect it locally
      if (!exportedAt) setExportedAt(new Date().toISOString())
      router.refresh()
    } catch {
      setPdfError('Network error — please try again.')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <>
    <div className="max-w-4xl no-print">
      {/* Queue nav bar */}
      <div className="no-print flex items-center justify-between mb-4 pb-4 border-b border-slate-700/50 gap-4 flex-wrap">
        <Link
          href={backHref || `/medic/emergency?site=${submission.site_id}`}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Submissions
        </Link>
        {queueContext && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {queueContext.pos + 1} of {queueContext.ids.length} pending
            </span>
            <div className="flex gap-1">
              {prevId ? (
                <Link
                  href={queueLink(prevId, queueContext.pos - 1)}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 rounded-lg transition-colors"
                >
                  ← Prev
                </Link>
              ) : (
                <span aria-disabled="true" className="px-3 py-1.5 text-xs font-medium bg-slate-800/40 border border-slate-700/40 text-slate-600 rounded-lg cursor-not-allowed">← Prev</span>
              )}
              {nextId ? (
                <Link
                  href={queueLink(nextId, queueContext.pos + 1)}
                  className="px-3 py-1.5 text-xs font-medium bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/15 rounded-lg transition-colors"
                >
                  Next →
                </Link>
              ) : (
                <span aria-disabled="true" className="px-3 py-1.5 text-xs font-medium bg-slate-800/40 border border-slate-700/40 text-slate-600 rounded-lg cursor-not-allowed">Next →</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Worker identity bar */}
      <div className="no-print bg-slate-800/60 border border-slate-700/50 rounded-xl px-5 py-4 mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-slate-100">
            {isPurged ? 'PHI Purged' : (ws?.fullName || 'Unknown Worker')}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {submission.role || 'Unknown role'}
            {siteName && <> · {siteName}</>}
            {submission.visit_date && <> · {fmt(submission.visit_date)}</>}
            {submission.shift_type && <> · {submission.shift_type}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasFlaggedMeds && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-semibold rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
              {(ws?.currentMedications ?? []).filter(m => FLAGGED_REVIEWS.includes(m?.reviewFlag ?? '')).length} flagged med(s)
            </span>
          )}
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[status]}`}>
            {status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* LEFT: scrollable clinical info */}
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 space-y-0">
          {/* Decision banner */}
          {decision && (
            <div className={`-mx-6 -mt-6 mb-6 px-6 py-3 text-sm border-b ${decision.outcome === 'Approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
              <span className="font-semibold">{decision.outcome}</span>
              {decision.note && <span> — {decision.note}</span>}
              <span className="ml-2 text-xs opacity-60" suppressHydrationWarning>
                {fmtDateTime(decision.decided_at)}
              </span>
            </div>
          )}

          {/* Flagged med callout */}
          {hasFlaggedMeds && !isPurged && hasSnapshot && (
            <div className="mb-5 p-4 bg-orange-500/[0.08] border border-orange-500/25 rounded-xl">
              <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">⚠ Flagged Medications</p>
              <div className="flex flex-wrap gap-2">
                {medications
                  .filter(m => FLAGGED_REVIEWS.includes(m?.reviewFlag ?? ''))
                  .map((m, i) => (
                    <span key={i} className="px-2.5 py-1 bg-orange-500/[0.12] border border-orange-500/25 text-orange-300 text-xs rounded-lg font-medium">
                      {m.reviewFlag} · {m.name} {m.dosage}
                    </span>
                  ))
                }
              </div>
            </div>
          )}

          {/* Clinical body */}
          {isPurged ? (
            <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl px-6 py-8 text-center">
              <p className="text-slate-400 font-medium">Medical information has been archived</p>
              <p className="text-slate-500 text-sm mt-1" suppressHydrationWarning>
                PHI was purged on {fmt(submission.phi_purged_at)}.
              </p>
            </div>
          ) : !hasSnapshot ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-6 py-8 text-center">
              <p className="text-amber-400 font-medium">Worker profile data unavailable</p>
              <p className="text-amber-500 text-sm mt-1">The medical profile snapshot could not be loaded for this submission.</p>
            </div>
          ) : (
            <div className="space-y-8">

              {/* Worker Information */}
              <div>
                <SectionHeader title="Worker Information" />
                <InfoRow label="Full Name" value={ws.fullName} />
                <InfoRow label="Date of Birth" value={fmt(ws.dateOfBirth)} />
                <InfoRow label="Employee ID" value={ws.employeeId} />
                <InfoRow label="Contractor" value={ws.isContractor} />
                <InfoRow label="Email" value={ws.emailAddress} />
                <InfoRow label="Mobile" value={ws.mobileNumber} />
                <InfoRow label="Company" value={ws.company} />
                <InfoRow label="Department" value={ws.department} />
                <InfoRow label="Role / Position" value={submission.role} />
                <InfoRow label="Shift Type" value={submission.shift_type} />
                <InfoRow label="Height" value={ws.heightCm ? `${ws.heightCm} cm` : null} />
                <InfoRow label="Weight" value={ws.weightKg ? `${ws.weightKg} kg` : null} />
                {ws.supervisor && <InfoRow label="Supervisor" value={ws.supervisor} />}
                {ws.siteLocation && <InfoRow label="Site Location" value={ws.siteLocation} />}
              </div>

              {/* Emergency Contact */}
              <div>
                <SectionHeader title="Emergency Contact" />
                <InfoRow label="Name" value={ws.emergencyContactName} />
                <InfoRow label="Mobile" value={ws.emergencyContactMobile} />
                {ws.emergencyContactRelationship && (
                  <InfoRow label="Relationship" value={ws.emergencyContactRelationship} />
                )}
                {ws.emergencyContactOther && (
                  <InfoRow label="Other" value={ws.emergencyContactOther} />
                )}
              </div>

              {extraEmergencyAnswers.length > 0 && (
                <div>
                  <SectionHeader title="Additional Declaration Details" />
                  {extraEmergencyAnswers.map(([key, value]) => (
                    <InfoRow key={key} label={formatEmergencyFieldLabel(key)} value={value} />
                  ))}
                </div>
              )}

              {/* Medical Information */}
              <div>
                <SectionHeader title="Medical Information" />

                {/* Allergies */}
                <div className="mb-5">
                  <p className="text-sm font-medium text-slate-300 mb-2">Allergies</p>
                  {ws.anaphylactic && (
                    <div className="mb-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
                      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span className="font-bold">ANAPHYLACTIC RISK</span>
                    </div>
                  )}
                  <p className="text-sm text-slate-300 bg-slate-900/40 border border-slate-700/30 px-3 py-2 rounded-lg">
                    {ws.allergies || 'None reported'}
                  </p>
                </div>

                {/* Medications */}
                <div className="mb-5">
                  <p className="text-sm font-medium text-slate-300 mb-2">Current Medications</p>
                  {medications.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-700/50">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-900/60">
                            <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Medication</th>
                            <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Dosage</th>
                            <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Frequency</th>
                            <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Review Flag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medications.map((med, i) => {
                            const isFlagged = FLAGGED_REVIEWS.includes(med?.reviewFlag ?? '')
                            return (
                              <tr key={med?.id ?? i} className={`border-t border-slate-700/50 ${isFlagged ? 'bg-orange-500/5' : ''}`}>
                                <td className="px-4 py-2.5 text-slate-100 font-medium">{med?.name || '—'}</td>
                                <td className="px-4 py-2.5 text-slate-300">{med?.dosage || '—'}</td>
                                <td className="px-4 py-2.5 text-slate-300">{med?.frequency || '—'}</td>
                                <td className="px-4 py-2.5">
                                  {isFlagged ? (
                                    <span className="text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-full">
                                      {med.reviewFlag}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-500">{med?.reviewFlag || 'None'}</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic bg-slate-900/40 border border-slate-700/30 px-3 py-2 rounded-lg">No medications reported</p>
                  )}
                </div>

                {/* Prescription Scripts */}
                {submission.scriptUploads.length > 0 && (
                  <div className="mb-5">
                    <p className="text-sm font-medium text-slate-300 mb-2">Prescription Scripts</p>
                    <div className="flex flex-wrap gap-3">
                      {submission.scriptUploads.map((upload) => (
                        <button
                          key={upload.medicationId}
                          onClick={() => upload.signedUrl && setLightboxUrl(upload.signedUrl)}
                          disabled={!upload.signedUrl}
                          className="group relative flex flex-col items-center gap-1.5 bg-slate-900/40 border border-slate-700/50 rounded-xl px-4 py-3 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-8 h-8 text-slate-500 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs text-slate-400 font-medium max-w-[120px] text-center leading-tight">
                            {upload.medicationName}
                          </span>
                          <span className="text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            View script
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conditions */}
                <div className="mb-5">
                  <p className="text-sm font-medium text-slate-300 mb-2">Disclosed Conditions</p>
                  {conditionFlags.length > 0 ? (
                    <div className="space-y-2">
                      {conditionFlags.map(([key, val]) => (
                        <div key={key} className="bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 rounded-xl">
                          <p className="text-sm font-medium text-amber-400">{val?.label || key}</p>
                          {val?.detail && <p className="text-xs text-amber-500 mt-0.5">{val.detail}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic bg-slate-900/40 border border-slate-700/30 px-3 py-2 rounded-lg">No conditions disclosed</p>
                  )}
                </div>

                {/* Immunisations */}
                <div>
                  <p className="text-sm font-medium text-slate-300 mb-2">Immunisations</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900/40 rounded-xl px-4 py-3 border border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Tetanus</p>
                      <p className="text-sm font-medium text-slate-200">
                        {ws.tetanus?.immunised ? 'Immunised' : 'Not immunised'}
                      </p>
                      {ws.tetanus?.immunised && ws.tetanus?.lastDoseDate && (
                        <p className="text-xs text-slate-500 mt-1" suppressHydrationWarning>
                          Last dose: {fmt(ws.tetanus.lastDoseDate)}
                        </p>
                      )}
                    </div>
                    <div className="bg-slate-900/40 rounded-xl px-4 py-3 border border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Hepatitis B</p>
                      <p className="text-sm font-medium text-slate-200">
                        {ws.hepatitisB?.immunised ? 'Immunised' : 'Not immunised'}
                      </p>
                      {ws.hepatitisB?.immunised && ws.hepatitisB?.lastDoseDate && (
                        <p className="text-xs text-slate-500 mt-1" suppressHydrationWarning>
                          Last dose: {fmt(ws.hepatitisB.lastDoseDate)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submission Details */}
              <div>
                <SectionHeader title="Submission Details" />
                <div suppressHydrationWarning>
                  <InfoRow label="Submitted" value={fmtDateTime(submission.submitted_at)} />
                  <InfoRow label="Consent Given" value={submission.consent_given} />
                </div>
              </div>

            </div>
          )}
        </div>

        {/* RIGHT: sticky action panel */}
        <div className="space-y-4 lg:sticky lg:top-6">
          {/* Decision panel card */}
          <div className="no-print bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
            <SectionHeader title="Decision" />
            {actionError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
                {actionError}
              </div>
            )}

            {status === 'New' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Mark this submission as in review to begin your assessment.</p>
                <button
                  onClick={() => updateStatus('In Review')}
                  disabled={loading}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg font-medium text-sm transition-colors duration-200 disabled:opacity-50"
                >
                  {loading ? 'Updating...' : 'Mark In Review'}
                </button>
              </div>
            )}

            {status === 'In Review' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Record your decision for this submission.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => updateStatus('Approved')}
                    disabled={loading}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors duration-200 disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => { setShowFollowUpModal(true); setFollowUpNote('') }}
                    disabled={loading}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium text-sm transition-colors duration-200 disabled:opacity-50"
                  >
                    Requires Follow-up
                  </button>
                </div>
              </div>
            )}

            {status === 'Requires Follow-up' && (
              <div className="space-y-4">
                {decision && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                    <p className="font-semibold mb-1">Follow-up required</p>
                    {decision.note && <p>{decision.note}</p>}
                    <p className="text-xs opacity-60 mt-1" suppressHydrationWarning>
                      {fmtDateTime(decision.decided_at)}
                    </p>
                  </div>
                )}
                <p className="text-sm text-slate-500">
                  Outcome locked. You can still re-export this record until it is purged.
                </p>
              </div>
            )}

            {status === 'Approved' && decision && (
              <div className="space-y-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400">
                  <p className="font-semibold">Approved</p>
                  {decision.note && <p className="mt-1">{decision.note}</p>}
                  <p className="text-xs opacity-60 mt-1" suppressHydrationWarning>
                    {fmtDateTime(decision.decided_at)}
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  Outcome locked. The PDF is locked to new comments now that it is approved.
                </p>
              </div>
            )}

            {/* Export PDF */}
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <div className="flex flex-col gap-1">
                <button
                  onClick={handleExportPdf}
                  disabled={pdfLoading}
                  className="w-full px-4 py-2.5 text-sm bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-slate-100 border border-slate-600/50 hover:border-slate-500 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pdfLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      {exportedAt ? 'Download PDF Again' : 'Export PDF'}
                    </>
                  )}
                </button>
                {pdfError && <p className="text-xs text-red-400">{pdfError}</p>}
                {exportedAt && !pdfError && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1" suppressHydrationWarning>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Exported {fmtDateTime(exportedAt)}. Available to re-export until it is purged.
                  </p>
                )}
              </div>
            </div>

            {/* Next Submission button */}
            {isDecisionLocked && (
              <div className="pt-3">
                {nextId ? (
                  <Link
                    href={queueLink(nextId, (queueContext?.pos ?? 0) + 1)}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/15 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Next Submission →
                  </Link>
                ) : (
                  <Link
                    href={backHref || `/medic/emergency?site=${submission.site_id}`}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-700/50 border border-slate-700 text-slate-300 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    ← Back to list
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Comments card */}
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
            <SectionHeader title="Medic Comments" />

            {comments.length === 0 && (
              <p className="text-sm text-slate-500 mb-5">No comments yet.</p>
            )}

            {comments.length > 0 && (
              <div className="space-y-4 mb-6">
                {comments.map(comment => {
                  const isOwn = comment.medic_user_id === currentUserId
                  return (
                    <div key={comment.id} className="border border-slate-700/50 rounded-lg p-4">
                      {/* Author + timestamp */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${isOwn ? 'text-cyan-400' : 'text-slate-300'}`}>
                            {comment.medic_name}
                          </span>
                          {isOwn && (
                            <span className="text-xs text-slate-600">(you)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500" suppressHydrationWarning>
                          <span>{fmtDateTime(comment.created_at)}</span>
                        </div>
                      </div>

                      <p className="text-sm text-slate-200 whitespace-pre-wrap">{comment.note}</p>
                      {isOwn && (
                        <p className="mt-2 text-xs text-slate-500">Saved as part of the clinical audit trail.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* New comment composer */}
            {areCommentsLocked ? (
              <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-4 py-3">
                <p className="text-sm font-medium text-slate-300">Comments locked</p>
                <p className="mt-1 text-xs text-slate-500">
                  {commentLockMessage}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Notes are append-only once posted so the review history stays intact.
                </p>
                <textarea
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  placeholder="Add a comment…"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm resize-none"
                />
                {commentError && (
                  <p className="text-xs text-red-400">{commentError}</p>
                )}
                <button
                  onClick={handleAddComment}
                  disabled={commentSaving || !commentDraft.trim()}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {commentSaving ? 'Posting…' : 'Post Comment'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Script Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 no-print"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Prescription script"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Follow-up Modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-2">Requires Follow-up</h3>
            <p className="text-sm text-slate-400 mb-4">Describe what follow-up is required.</p>
            <textarea
              value={followUpNote}
              onChange={e => setFollowUpNote(e.target.value)}
              placeholder="Enter follow-up note..."
              rows={4}
              className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm resize-none"
            />
            {actionError && (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">
                {actionError}
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => updateStatus('Requires Follow-up', followUpNote)}
                disabled={loading || !followUpNote.trim()}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium text-sm transition-colors duration-200 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Confirm'}
              </button>
              <button
                onClick={() => { setShowFollowUpModal(false); setFollowUpNote('') }}
                disabled={loading}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 rounded-lg font-medium text-sm transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
