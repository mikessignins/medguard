'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getExportErrorMessage } from '@/lib/export-feedback'
import type { MedicationDeclaration, MedDecReviewStatus, ScriptUpload } from '@/lib/types'
import { encodeQueue } from '@/lib/queue-params'
import { isFinalMedicationReviewStatus } from '@/lib/medication-review-guards'

const REVIEW_STATUSES: Exclude<MedDecReviewStatus, 'Pending'>[] = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']

const STATUS_COLORS: Record<MedDecReviewStatus, string> = {
  'Pending':          'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  'In Review':        'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Normal Duties':    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Restricted Duties': 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  'Unfit for Work':   'bg-red-500/10 text-red-400 border border-red-500/20',
}

function fmt(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', opts)
  } catch { return '—' }
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

interface Props {
  medDec: MedicationDeclaration & { scriptUploads: ScriptUpload[] }
  siteName: string
  businessName: string
  queueContext: { ids: string[]; pos: number } | null
  backHref?: string
}

export default function MedDecDetail({ medDec, siteName, businessName, queueContext, backHref }: Props) {
  const router = useRouter()
  const [reviewStatus, setReviewStatus] = useState<MedDecReviewStatus>(medDec.medic_review_status || 'Pending')
  const [comments, setComments] = useState(medDec.medic_comments || '')
  const [reviewRequired, setReviewRequired] = useState(medDec.review_required || false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const isPurged = !!medDec.phi_purged_at
  const isDecisionLocked = isFinalMedicationReviewStatus(medDec.medic_review_status)

  function queueLink(targetId: string, targetPos: number): string {
    if (!queueContext) return `/medic/med-declarations/${targetId}`
    return `/medic/med-declarations/${targetId}?${encodeQueue(queueContext.ids, targetPos)}`
  }

  const prevId = queueContext && queueContext.pos > 0 ? queueContext.ids[queueContext.pos - 1] : null
  const nextId = queueContext && queueContext.pos < queueContext.ids.length - 1 ? queueContext.ids[queueContext.pos + 1] : null

  async function handleSaveReview() {
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/medication-declarations/${medDec.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medic_review_status: reviewStatus,
          medic_comments: comments,
          review_required: reviewRequired,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error || 'Failed to save review')
      } else {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        router.refresh()
      }
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleExportPdf() {
    setExporting(true)
    setExportError('')
    try {
      const res = await fetch(`/api/medication-declarations/${medDec.id}/pdf`)
      if (!res.ok) {
        setExportError(await getExportErrorMessage(
          res,
          'The medication declaration PDF could not be exported.',
        ))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      a.href = url
      a.download = match?.[1] || `MedDec-${medDec.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      router.refresh()
    } catch {
      setExportError('Network error. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  function TwoColRow({ label, value }: { label: string; value: string }) {
    return (
      <div className="grid grid-cols-[140px_1fr] gap-2 py-2 border-b border-slate-800 last:border-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide self-center">{label}</p>
        <p className="text-sm text-slate-200">{value || '—'}</p>
      </div>
    )
  }

  return (
    <div>
      {/* Queue nav bar */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700/50 gap-4 flex-wrap">
        <Link
          href={backHref || `/medic/medications?site=${medDec.site_id}`}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Declarations
        </Link>
        {queueContext && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {queueContext.pos + 1} of {queueContext.ids.length} pending
            </span>
            <div className="flex items-center gap-1">
              {prevId ? (
                <Link href={queueLink(prevId, queueContext.pos - 1)} className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </Link>
              ) : (
                <span className="p-1.5 rounded-lg bg-slate-800/30 border border-slate-800 text-slate-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </span>
              )}
              {nextId ? (
                <Link href={queueLink(nextId, queueContext.pos + 1)} className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </Link>
              ) : (
                <span className="p-1.5 rounded-lg bg-slate-800/30 border border-slate-800 text-slate-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Identity bar */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-5 py-4 mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            {isPurged ? 'PHI Purged' : medDec.worker_name || 'Medication Declaration'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {!isPurged && medDec.job_title ? `${medDec.job_title} · ` : ''}
            {!isPurged && medDec.employer ? `${medDec.employer} · ` : ''}
            Submitted {fmtDateTime(medDec.submitted_at)}
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[reviewStatus]}`}>
          {reviewStatus}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

        {/* LEFT: content */}
        <div className="space-y-4">

          {/* Purged warning */}
          {isPurged && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4 text-center">
              <p className="text-slate-400 font-medium">PHI has been purged from this record.</p>
              <p className="text-xs text-slate-600 mt-1">Purged: {fmtDateTime(medDec.phi_purged_at)}</p>
            </div>
          )}

          {/* Health flags — prominent at top */}
          {!isPurged && (medDec.has_recent_injury_or_illness || medDec.has_side_effects) && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4">
              <p className="text-sm font-semibold text-amber-300 mb-1">⚠ Health Flags</p>
              <ul className="text-sm text-amber-200 space-y-1 list-disc list-inside">
                {medDec.has_recent_injury_or_illness && <li>Worker has a recent injury or illness</li>}
                {medDec.has_side_effects && <li>Medication may produce side effects that affect safety</li>}
              </ul>
            </div>
          )}

          {/* Worker details */}
          {!isPurged && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Worker Details</h2>
              <TwoColRow label="Full Name" value={medDec.worker_name} />
              <TwoColRow label="Date of Birth" value={fmt(medDec.worker_dob)} />
              <TwoColRow label="Employer" value={medDec.employer} />
              <TwoColRow label="Department" value={medDec.department} />
              <TwoColRow label="Job Title" value={medDec.job_title} />
              <TwoColRow label="Site" value={siteName} />
              <TwoColRow label="Business" value={businessName} />
            </div>
          )}

          {/* Medications */}
          {!isPurged && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Medications ({medDec.medications?.length ?? 0})
              </h2>
              {!medDec.medications || medDec.medications.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No medications declared.</p>
              ) : (
                <div className="space-y-3">
                  {medDec.medications.map((med, i) => (
                    <div
                      key={med.id || i}
                      className={`rounded-lg border px-4 py-3 ${med.flaggedForSideEffects ? 'bg-orange-500/10 border-orange-500/20' : 'bg-slate-900/40 border-slate-700/50'}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-semibold text-slate-100 text-sm">{med.name}</p>
                        {med.flaggedForSideEffects && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/20 shrink-0">
                            Side Effect Risk
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span><span className="text-slate-600">Type:</span> {med.prescriptionType || '—'}</span>
                        <span><span className="text-slate-600">Dosage/Day:</span> {med.dosagePerDay || '—'}</span>
                        <span><span className="text-slate-600">Duration:</span> {med.duration || '—'}</span>
                        <span><span className="text-slate-600">Class:</span> {med.medicationClass || '—'}</span>
                        {med.isLongTerm && <span className="col-span-2 text-slate-500">Long-term medication</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Script uploads */}
          {!isPurged && medDec.scriptUploads && medDec.scriptUploads.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Prescription Scripts ({medDec.scriptUploads.length})
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {medDec.scriptUploads.map((upload, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxUrl(upload.signedUrl || upload.downloadURL || null)}
                    className="aspect-[3/4] rounded-lg overflow-hidden border border-slate-700 hover:border-slate-500 transition-colors bg-slate-900/50 flex items-center justify-center"
                  >
                    {upload.signedUrl || upload.downloadURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={upload.signedUrl || upload.downloadURL!}
                        alt={upload.medicationName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-3">
                        <svg className="w-6 h-6 text-slate-600 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-xs text-slate-500">{upload.medicationName}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: sticky action panel */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* Review panel */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Outcome</h2>

            {/* Status selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              {REVIEW_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setReviewStatus(s)}
                  disabled={isDecisionLocked}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    reviewStatus === s
                      ? STATUS_COLORS[s]
                      : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-slate-600'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Further review toggle */}
            <div className="flex items-center justify-between py-3 border-t border-slate-800 mb-4">
              <div>
                <p className="text-sm font-medium text-slate-300">Further Review</p>
                <p className="text-xs text-slate-500 mt-0.5">Flag for follow-up</p>
              </div>
              <button
                onClick={() => setReviewRequired(v => !v)}
                disabled={isDecisionLocked}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${reviewRequired ? 'bg-cyan-500' : 'bg-slate-600'} disabled:cursor-not-allowed disabled:opacity-60`}
                aria-pressed={reviewRequired}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${reviewRequired ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {isDecisionLocked && (
              <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-400">
                Outcome locked. You can still add comments and re-export this declaration until it is purged.
              </div>
            )}

            {/* Comments */}
            <div className="mb-4 border-t border-slate-800 pt-4">
              <label className="block text-xs font-medium text-slate-400 mb-2">Comments</label>
              <textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                placeholder="Add medic comments…"
                rows={4}
                className="w-full px-3 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
              />
            </div>

            {saveError && <p className="text-sm text-red-400 mb-3">{saveError}</p>}

            <div className="flex items-center justify-between gap-3">
              {saveSuccess && (
                <span className="text-sm text-emerald-400 font-medium">Saved</span>
              )}
              <button
                onClick={handleSaveReview}
                disabled={saving}
                className="ml-auto px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : isDecisionLocked ? 'Save Comments' : 'Save Review'}
              </button>
            </div>
          </div>

          {/* Export / audit */}
          {!isPurged && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Export &amp; Audit</h2>
              <div className="text-sm text-slate-400 space-y-1 mb-4">
                {medDec.exported_at ? (
                  <p>Exported: <span className="text-slate-300">{fmtDateTime(medDec.exported_at)}</span></p>
                ) : (
                  <p className="text-slate-500 italic">Not yet exported</p>
                )}
              </div>
              {exportError && <p className="text-sm text-red-400 mb-3">{exportError}</p>}
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="flex items-center gap-2 w-full justify-center px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exporting ? 'Generating…' : medDec.exported_at ? 'Download PDF Again' : 'Export PDF'}
              </button>
            </div>
          )}

          {/* Queue navigation — next submission button */}
          {queueContext && nextId && (
            <Link
              href={queueLink(nextId, queueContext.pos + 1)}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/15 rounded-lg text-sm font-semibold transition-colors"
            >
              Next Declaration →
            </Link>
          )}
          {queueContext && !nextId && (
            <Link
              href={backHref || `/medic/medications?site=${medDec.site_id}`}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-700/50 border border-slate-700 text-slate-300 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              ← Back to list
            </Link>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Script"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
