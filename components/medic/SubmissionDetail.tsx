'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
  exported_at: string | null
  phi_purged_at: string | null
  worker_snapshot: WorkerSnapshot | null
  decision: Decision | null
  scriptUploads: ScriptUpload[]
  comments: MedicComment[]
}

interface Props {
  submission: SafeSubmission
  siteName: string
  businessName: string
  currentUserId: string
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

export default function SubmissionDetail({ submission, siteName, businessName, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

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
      if (!res.ok) { setCommentError(await res.text()); return }
      const newComment: MedicComment = await res.json()
      setComments(prev => [...prev, newComment])
      setCommentDraft('')
    } catch {
      setCommentError('Network error — please try again.')
    } finally {
      setCommentSaving(false)
    }
  }

  async function handleSaveEdit(commentId: string) {
    const note = editDraft.trim()
    if (!note) return
    setCommentSaving(true)
    setCommentError('')
    try {
      const res = await fetch(`/api/declarations/${submission.id}/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, note }),
      })
      if (!res.ok) { setCommentError(await res.text()); return }
      const updated: MedicComment = await res.json()
      setComments(prev => prev.map(c => c.id === commentId ? updated : c))
      setEditingId(null)
      setEditDraft('')
    } catch {
      setCommentError('Network error — please try again.')
    } finally {
      setCommentSaving(false)
    }
  }

  async function handleDeleteComment(commentId: string) {
    setCommentError('')
    try {
      const res = await fetch(`/api/declarations/${submission.id}/comments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      })
      if (!res.ok) { setCommentError(await res.text()); return }
      setComments(prev => prev.filter(c => c.id !== commentId))
    } catch {
      setCommentError('Network error — please try again.')
    }
  }

  const ws = submission.worker_snapshot
  const isPurged = !!submission.phi_purged_at
  const hasSnapshot = !!ws && typeof ws === 'object'

  const conditionFlags = hasSnapshot && ws.conditionChecklist
    ? Object.entries(ws.conditionChecklist).filter(([, v]) => v?.answer === true)
    : []

  const medications = hasSnapshot ? (ws.currentMedications || []) : []
  const hasFlaggedMeds = medications.some(m => FLAGGED_REVIEWS.includes(m?.reviewFlag ?? ''))

  async function updateStatus(newStatus: SubmissionStatus, note?: string) {
    setLoading(true)
    setActionError('')

    const updates: Record<string, unknown> = { status: newStatus }

    if (newStatus === 'Approved' || newStatus === 'Requires Follow-up') {
      updates.decision = {
        outcome: newStatus,
        note: note ?? '',
        decided_by_user_id: currentUserId,
        decided_at: new Date().toISOString(),
      }
    }

    const { error } = await supabase
      .from('submissions')
      .update(updates)
      .eq('id', submission.id)

    if (error) {
      setActionError(error.message)
      setLoading(false)
      return
    }

    setStatus(newStatus)
    if (updates.decision) setDecision(updates.decision as Decision)
    setLoading(false)
    setShowFollowUpModal(false)
    setFollowUpNote('')
    router.refresh()
  }

  async function handleExportPdf() {
    setPdfLoading(true)
    setPdfError('')
    try {
      const res = await fetch(`/api/declarations/${submission.id}/pdf`)
      if (!res.ok) {
        setPdfError(`Export failed (${res.status}). Please try again.`)
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
      {/* Back */}
      <div className="mb-6 no-print">
        <button
          onClick={() => router.back()}
          className="text-slate-500 hover:text-cyan-400 transition-colors duration-200 text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to submissions
        </button>
      </div>

      <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden">
        {/* Title bar */}
        <div className="px-6 py-5 border-b border-slate-700/50 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              {ws?.fullName || 'Worker Declaration'}
            </h1>
            <p className="text-sm text-slate-400 mt-1" suppressHydrationWarning>
              {siteName} &middot; {fmt(submission.visit_date, { day: '2-digit', month: 'short', year: 'numeric' })} &middot; {submission.shift_type || 'N/A'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 no-print">
            <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${STATUS_COLORS[status]}`}>
              {status}
            </span>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleExportPdf}
                disabled={pdfLoading}
                className="px-4 py-2 text-sm bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-slate-100 border border-slate-600/50 hover:border-slate-500 rounded-lg transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    Export PDF
                  </>
                )}
              </button>
              {pdfError && (
                <p className="text-xs text-red-400">{pdfError}</p>
              )}
              {exportedAt && !pdfError && (
                <p className="text-xs text-emerald-400 flex items-center gap-1" suppressHydrationWarning>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Exported {fmtDateTime(exportedAt)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Flagged medication alert */}
        {hasFlaggedMeds && (
          <div className="px-6 py-3 bg-orange-500/10 border-b border-orange-500/20 flex items-center gap-2 text-orange-300 text-sm">
            <svg className="w-4 h-4 shrink-0 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span><strong>Medication review required</strong> — this worker has flagged medications.</span>
          </div>
        )}

        {/* Decision banner */}
        {decision && (
          <div className={`px-6 py-3 text-sm border-b ${decision.outcome === 'Approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
            <span className="font-semibold">{decision.outcome}</span>
            {decision.note && <span> — {decision.note}</span>}
            <span className="ml-2 text-xs opacity-60" suppressHydrationWarning>
              {fmtDateTime(decision.decided_at)}
            </span>
          </div>
        )}

        {/* Body */}
        {isPurged ? (
          <div className="p-6">
            <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl px-6 py-8 text-center">
              <p className="text-slate-400 font-medium">Medical information has been archived</p>
              <p className="text-slate-500 text-sm mt-1" suppressHydrationWarning>
                PHI was purged on {fmt(submission.phi_purged_at)}.
              </p>
            </div>
          </div>
        ) : !hasSnapshot ? (
          <div className="p-6">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-6 py-8 text-center">
              <p className="text-amber-400 font-medium">Worker profile data unavailable</p>
              <p className="text-amber-500 text-sm mt-1">The medical profile snapshot could not be loaded for this submission.</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-8">

            {/* Worker Information */}
            <div>
              <SectionHeader title="Worker Information" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <div>
                  <InfoRow label="Full Name" value={ws.fullName} />
                  <InfoRow label="Date of Birth" value={fmt(ws.dateOfBirth)} />
                  <InfoRow label="Email" value={ws.emailAddress} />
                  <InfoRow label="Mobile" value={ws.mobileNumber} />
                  <InfoRow label="Company" value={ws.company} />
                  <InfoRow label="Department" value={ws.department} />
                  {ws.supervisor && <InfoRow label="Supervisor" value={ws.supervisor} />}
                  {ws.siteLocation && <InfoRow label="Site Location" value={ws.siteLocation} />}
                </div>
                <div>
                  <InfoRow label="Employee ID" value={ws.employeeId} />
                  <InfoRow label="Contractor" value={ws.isContractor} />
                  <InfoRow label="Height" value={ws.heightCm ? `${ws.heightCm} cm` : null} />
                  <InfoRow label="Weight" value={ws.weightKg ? `${ws.weightKg} kg` : null} />
                  <InfoRow label="Role / Position" value={submission.role} />
                  <InfoRow label="Shift Type" value={submission.shift_type} />
                </div>
              </div>
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

            {/* Action Panel */}
            <div className="no-print">
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
                  <p className="text-sm text-slate-500">Once the follow-up has been resolved, approve this submission.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => updateStatus('Approved')}
                      disabled={loading}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors duration-200 disabled:opacity-50"
                    >
                      {loading ? 'Updating...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => { setShowFollowUpModal(true); setFollowUpNote(decision?.note ?? '') }}
                      disabled={loading}
                      className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 rounded-lg font-medium text-sm transition-colors duration-200 disabled:opacity-50"
                    >
                      Update Follow-up Note
                    </button>
                  </div>
                </div>
              )}

              {status === 'Approved' && decision && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400">
                  <p className="font-semibold">Approved</p>
                  {decision.note && <p className="mt-1">{decision.note}</p>}
                  <p className="text-xs opacity-60 mt-1" suppressHydrationWarning>
                    {fmtDateTime(decision.decided_at)}
                  </p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ── Comments ───────────────────────────────────────────────────────── */}
      <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 mt-6">
        <SectionHeader title="Medic Comments" />

        {comments.length === 0 && (
          <p className="text-sm text-slate-500 mb-5">No comments yet.</p>
        )}

        {comments.length > 0 && (
          <div className="space-y-4 mb-6">
            {comments.map(comment => {
              const isOwn = comment.medic_user_id === currentUserId
              const isEditing = editingId === comment.id
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
                      {comment.edited_at && <span className="italic">· edited</span>}
                    </div>
                  </div>

                  {/* Body */}
                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-900/60 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(comment.id)}
                          disabled={commentSaving || !editDraft.trim()}
                          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {commentSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditDraft('') }}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-slate-200 whitespace-pre-wrap">{comment.note}</p>
                      {isOwn && (
                        <div className="flex gap-3 mt-2">
                          <button
                            onClick={() => { setEditingId(comment.id); setEditDraft(comment.note) }}
                            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* New comment composer */}
        {!isPurged && (
          <div className="space-y-2">
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
