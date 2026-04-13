'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  formatPsychosocialWorkflowKind,
  getPsychosocialWorkerName,
  getPsychosocialWorkflowKind,
} from '@/lib/psychosocial'
import type {
  FatigueAssessment,
  MedDecReviewStatus,
  MedicationDeclaration,
  PsychosocialAssessment,
  Site,
  Submission,
  SubmissionStatus,
} from '@/lib/types'
import { formatPsychosocialRiskLevel } from '@/lib/psychosocial'

const FINAL_SUBMISSION_STATUSES: SubmissionStatus[] = ['Approved', 'Requires Follow-up']
const FINAL_MED_DEC_STATUSES: MedDecReviewStatus[] = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']
const FINAL_FATIGUE_STATUS = 'resolved'
const FINAL_PSYCHOSOCIAL_STATUS = 'resolved'
type ExportConfirmFormType = 'emergency_declaration' | 'medication_declaration' | 'fatigue_assessment' | 'psychosocial_health'

function isTestRecord(item: { is_test?: boolean | null }) {
  return item.is_test === true
}

const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  'New': 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Approved': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Requires Follow-up': 'bg-red-500/10 text-red-400 border border-red-500/20',
  'Recalled': 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
}

const MED_DEC_STATUS_COLORS: Record<MedDecReviewStatus, string> = {
  'Pending': 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Normal Duties': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Restricted Duties': 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  'Unfit for Work': 'bg-red-500/10 text-red-400 border border-red-500/20',
}

function fmtDate(value: string | null | undefined) {
  if (!value) return 'No date'
  try {
    return format(new Date(value), 'dd MMM yyyy')
  } catch {
    return 'No date'
  }
}

function SitePicker({
  sites,
  activeTab,
  onChange,
  badgeCounts,
}: {
  sites: Array<Pick<Site, 'id' | 'name' | 'is_office'>>
  activeTab: string
  onChange: (siteId: string) => void
  badgeCounts: Record<string, number>
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {sites.map((site) => {
        const isActive = activeTab === site.id
        const count = badgeCounts[site.id] || 0
        return (
          <button
            key={site.id}
            onClick={() => onChange(site.id)}
            className={isActive ? 'medic-site-pill-active' : 'medic-site-pill'}
          >
            {site.name}
            {count > 0 && <span className="medic-site-badge">{count}</span>}
          </button>
        )
      })}
    </div>
  )
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

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
    </div>
  )
}

interface Props {
  sites: Array<Pick<Site, 'id' | 'name' | 'is_office'>>
  submissions: MedicExportsSubmission[]
  medDeclarations: MedicExportsMedDec[]
  fatigueAssessments: MedicExportsFatigue[]
  psychosocialAssessments: MedicExportsPsychosocial[]
  initialSite?: string
}

export default function MedicExportsDashboard({ sites, submissions, medDeclarations, fatigueAssessments, psychosocialAssessments, initialSite }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(initialSite || sites[0]?.id || '')
  const [selectedTestSubmissionIds, setSelectedTestSubmissionIds] = useState<Set<string>>(new Set())
  const [selectedTestMedDecIds, setSelectedTestMedDecIds] = useState<Set<string>>(new Set())
  const [selectedTestFatigueIds, setSelectedTestFatigueIds] = useState<Set<string>>(new Set())
  const [submissionError, setSubmissionError] = useState('')
  const [medDecError, setMedDecError] = useState('')
  const [fatigueError, setFatigueError] = useState('')
  const [psychosocialError, setPsychosocialError] = useState('')
  const [purgingSubmissions, setPurgingSubmissions] = useState(false)
  const [purgingMedDecs, setPurgingMedDecs] = useState(false)
  const [purgingFatigue, setPurgingFatigue] = useState(false)
  const [selectedTestPsychosocialIds, setSelectedTestPsychosocialIds] = useState<Set<string>>(new Set())
  const [purgingPsychosocial, setPurgingPsychosocial] = useState(false)
  const [confirmingExportId, setConfirmingExportId] = useState<string | null>(null)

  const siteSubmissions = submissions.filter((s) => s.site_id === activeTab && s.status !== 'Recalled')
  const readySubmissions = siteSubmissions.filter((s) => !isTestRecord(s) && !s.exported_at && !s.phi_purged_at && FINAL_SUBMISSION_STATUSES.includes(s.status))
  const exportedSubmissions = siteSubmissions.filter((s) => !isTestRecord(s) && !!s.exported_at && !s.export_confirmed_at && !s.phi_purged_at)
  const testSubmissions = siteSubmissions.filter((s) => isTestRecord(s) && !s.phi_purged_at && FINAL_SUBMISSION_STATUSES.includes(s.status))
  const siteMedDecs = medDeclarations.filter((m) => m.site_id === activeTab)
  const readyMedDecs = siteMedDecs.filter((m) => !isTestRecord(m) && !m.exported_at && !m.phi_purged_at && FINAL_MED_DEC_STATUSES.includes(m.medic_review_status))
  const exportedMedDecs = siteMedDecs.filter((m) => !isTestRecord(m) && !!m.exported_at && !m.export_confirmed_at && !m.phi_purged_at)
  const testMedDecs = siteMedDecs.filter((m) => isTestRecord(m) && !m.phi_purged_at && FINAL_MED_DEC_STATUSES.includes(m.medic_review_status))

  const siteFatigue = fatigueAssessments.filter((item) => item.site_id === activeTab)
  const readyFatigue = siteFatigue.filter((item) => !isTestRecord(item) && !item.exported_at && !item.phi_purged_at && item.status === FINAL_FATIGUE_STATUS)
  const exportedFatigue = siteFatigue.filter((item) => !isTestRecord(item) && !!item.exported_at && !item.export_confirmed_at && !item.phi_purged_at)
  const testFatigue = siteFatigue.filter((item) => isTestRecord(item) && !item.phi_purged_at && item.status === FINAL_FATIGUE_STATUS)

  const sitePsychosocial = psychosocialAssessments.filter(
    (item) =>
      item.site_id === activeTab
      && ['support_check_in', 'post_incident_psychological_welfare'].includes(getPsychosocialWorkflowKind(item) ?? '')
  )
  const readyPsychosocial = sitePsychosocial.filter((item) => !isTestRecord(item) && !item.exported_at && !item.phi_purged_at && item.status === FINAL_PSYCHOSOCIAL_STATUS)
  const exportedPsychosocial = sitePsychosocial.filter((item) => !isTestRecord(item) && !!item.exported_at && !item.export_confirmed_at && !item.phi_purged_at)
  const testPsychosocial = sitePsychosocial.filter((item) => isTestRecord(item) && !item.phi_purged_at && item.status === FINAL_PSYCHOSOCIAL_STATUS)

  const badgeCounts = Object.fromEntries(
    sites.map((site) => {
      const subCount = submissions.filter((s) => s.site_id === site.id && s.status !== 'Recalled' && !s.phi_purged_at && ((isTestRecord(s) && FINAL_SUBMISSION_STATUSES.includes(s.status)) || (!isTestRecord(s) && (FINAL_SUBMISSION_STATUSES.includes(s.status) || !!s.exported_at)))).length
      const medCount = medDeclarations.filter((m) => m.site_id === site.id && !m.phi_purged_at && ((isTestRecord(m) && FINAL_MED_DEC_STATUSES.includes(m.medic_review_status)) || (!isTestRecord(m) && (FINAL_MED_DEC_STATUSES.includes(m.medic_review_status) || !!m.exported_at)))).length
      const fatigueCount = fatigueAssessments.filter((item) => item.site_id === site.id && !item.phi_purged_at && ((isTestRecord(item) && item.status === FINAL_FATIGUE_STATUS) || (!isTestRecord(item) && (item.status === FINAL_FATIGUE_STATUS || !!item.exported_at)))).length
      const psychosocialCount = psychosocialAssessments.filter((item) => item.site_id === site.id && !item.phi_purged_at && ['support_check_in', 'post_incident_psychological_welfare'].includes(getPsychosocialWorkflowKind(item) ?? '') && ((isTestRecord(item) && item.status === FINAL_PSYCHOSOCIAL_STATUS) || (!isTestRecord(item) && (item.status === FINAL_PSYCHOSOCIAL_STATUS || !!item.exported_at)))).length
      return [site.id, subCount + medCount + fatigueCount + psychosocialCount]
    })
  )

  function submissionHref(id: string) {
    return `/medic/submissions/${id}?view=exports&site=${activeTab}`
  }

  function medDecHref(id: string) {
    return `/medic/med-declarations/${id}?view=exports&site=${activeTab}`
  }

  function fatigueHref(id: string) {
    return `/medic/fatigue/${id}?view=exports&site=${activeTab}`
  }

  function psychosocialHref(id: string) {
    return `/medic/psychosocial/${id}?view=exports&site=${activeTab}`
  }

  function pdfHref(formType: ExportConfirmFormType, id: string) {
    switch (formType) {
      case 'emergency_declaration':
        return `/api/declarations/${id}/pdf`
      case 'medication_declaration':
        return `/api/medication-declarations/${id}/pdf`
      case 'fatigue_assessment':
        return `/api/fatigue-assessments/${id}/pdf`
      case 'psychosocial_health':
        return `/api/psychosocial-assessments/${id}/pdf`
    }
  }

  async function confirmExportAndPurge({
    formType,
    id,
    setError,
  }: {
    formType: ExportConfirmFormType
    id: string
    setError: (message: string) => void
  }) {
    const confirmed = window.confirm(
      'Confirm this PDF has been successfully saved to the authorised medical record location. After confirmation, MedGuard will permanently remove the stored health information for this form and keep only the audit record.',
    )
    if (!confirmed) return

    setConfirmingExportId(id)
    setError('')
    try {
      const res = await fetch('/api/exports/confirm-and-purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formType, id, confirmed: true }),
      })
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null)
        const text = data?.error ? '' : await res.text().catch(() => '')
        setError(data?.error || text || 'Export confirmation failed')
        return
      }
      router.refresh()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setConfirmingExportId(null)
    }
  }

  function toggleSelected(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function purgeRecords({
    ids,
    endpoint,
    setError,
    setPurging,
    clearSelection,
    fallbackError = 'Purge failed',
  }: {
    ids: Set<string>
    endpoint: string
    setError: (message: string) => void
    setPurging: (isPurging: boolean) => void
    clearSelection: () => void
    fallbackError?: string
  }) {
    if (ids.size === 0) return
    setPurging(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(ids) }),
      })
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null)
        const text = data?.error ? '' : await res.text().catch(() => '')
        setError(data?.error || text || fallbackError)
        return
      }
      clearSelection()
      router.refresh()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setPurging(false)
    }
  }

  async function purgeSubmissions(ids: Set<string>, clearSelection: () => void) {
    if (ids.size === 0) return
    setPurgingSubmissions(true)
    setSubmissionError('')
    try {
      const res = await fetch('/api/declarations/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(ids) }),
      })
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null)
        const text = data?.error ? '' : await res.text().catch(() => '')
        setSubmissionError(data?.error || text || 'Purge failed')
        return
      }
      clearSelection()
      router.refresh()
    } catch {
      setSubmissionError('Network error — please try again.')
    } finally {
      setPurgingSubmissions(false)
    }
  }

  async function purgeMedDecs(ids: Set<string>, clearSelection: () => void) {
    await purgeRecords({
      ids,
      endpoint: '/api/medication-declarations/purge',
      setError: setMedDecError,
      setPurging: setPurgingMedDecs,
      clearSelection,
    })
  }

  async function purgeFatigueAssessments(ids: Set<string>, clearSelection: () => void) {
    await purgeRecords({
      ids,
      endpoint: '/api/fatigue-assessments/purge',
      setError: setFatigueError,
      setPurging: setPurgingFatigue,
      clearSelection,
    })
  }

  async function purgePsychosocialAssessments(ids: Set<string>, clearSelection: () => void) {
    await purgeRecords({
      ids,
      endpoint: '/api/psychosocial-assessments/purge',
      setError: setPsychosocialError,
      setPurging: setPurgingPsychosocial,
      clearSelection,
    })
  }

  if (sites.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg">No sites assigned to your account.</p>
        <p className="text-sm mt-1">Contact your administrator to be assigned to a site.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="medic-hero">
        <div className="max-w-3xl">
          <p className="medic-kicker">Exports &amp; Retention</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--medic-text)]">Reviewed forms and export confirmation</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--medic-muted)]">
          Reviewed forms leave the active queue and live here until export is confirmed. Once a PDF is saved, MedGuard removes the stored health information and keeps the audit record.
          </p>
        </div>
        <div className="medic-summary-pill">PHI transit mode</div>
      </div>

      <SitePicker sites={sites} activeTab={activeTab} onChange={setActiveTab} badgeCounts={badgeCounts} />

      <div className="space-y-4">
        <SectionHeader title="Emergency Medical Forms" subtitle="Final decisions become export-ready here. Confirm export only after the PDF is saved." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Ready to Export</p><p className="mt-1 text-2xl font-bold text-cyan-400">{readySubmissions.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Needs Confirmation</p><p className="mt-1 text-2xl font-bold text-amber-400">{exportedSubmissions.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Test Cleanup</p><p className="mt-1 text-2xl font-bold text-emerald-400">{testSubmissions.length}</p></div>
        </div>

        {readySubmissions.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Ready to Export</p></div>
            {readySubmissions.map((sub, i) => (
              <Link key={sub.id} href={submissionHref(sub.id)} className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-100">{sub.worker_snapshot?.fullName || 'Unknown Worker'}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmtDate(sub.visit_date)} · {sub.shift_type || 'N/A'}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${SUBMISSION_STATUS_COLORS[sub.status]}`}>{sub.status}</span>
              </Link>
            ))}
          </div>
        )}

        {exportedSubmissions.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Export Confirmation Required</p>
            </div>
            {submissionError && <p className="text-sm text-red-400">{submissionError}</p>}
            <div className="rounded-xl border border-slate-700/50 overflow-hidden">
              {exportedSubmissions.map((sub, i) => (
                <div key={sub.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                  <Link href={submissionHref(sub.id)} className="flex-1 text-left hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{sub.worker_snapshot?.fullName || 'Unknown Worker'}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(sub.visit_date)} · {sub.shift_type || 'N/A'}</p>
                    </div>
                  </Link>
                  <a href={pdfHref('emergency_declaration', sub.id)} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm hover:bg-slate-700/50">Download again</a>
                  <button onClick={() => confirmExportAndPurge({ formType: 'emergency_declaration', id: sub.id, setError: setSubmissionError })} disabled={confirmingExportId === sub.id} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50">
                    {confirmingExportId === sub.id ? 'Removing…' : 'Confirm and remove PHI'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {testSubmissions.length > 0 && (
          <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Reviewed Test Records</p>
                <p className="mt-1 text-sm text-slate-400">PDF export is disabled during testing. Purge these records when they are no longer needed.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedTestSubmissionIds(selectedTestSubmissionIds.size === testSubmissions.length ? new Set() : new Set(testSubmissions.map((sub) => sub.id)))} className="text-sm text-cyan-400 hover:underline">
                  {selectedTestSubmissionIds.size === testSubmissions.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedTestSubmissionIds.size > 0 && (
                  <button onClick={() => purgeSubmissions(selectedTestSubmissionIds, () => setSelectedTestSubmissionIds(new Set()))} disabled={purgingSubmissions} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {purgingSubmissions ? 'Purging…' : `Purge test records (${selectedTestSubmissionIds.size})`}
                  </button>
                )}
              </div>
            </div>
            {submissionError && <p className="text-sm text-red-400">{submissionError}</p>}
            <div className="rounded-xl border border-emerald-500/20 overflow-hidden">
              {testSubmissions.map((sub, i) => (
                <div key={sub.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-emerald-500/20' : ''}`}>
                  <input type="checkbox" checked={selectedTestSubmissionIds.has(sub.id)} onChange={() => toggleSelected(setSelectedTestSubmissionIds, sub.id)} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer" />
                  <Link href={submissionHref(sub.id)} className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{sub.worker_snapshot?.fullName || 'Unknown Worker'}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(sub.visit_date)} · {sub.shift_type || 'N/A'}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${SUBMISSION_STATUS_COLORS[sub.status]}`}>{sub.status}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <SectionHeader title="Confidential Medication Declarations" subtitle="Final medication reviews stay here until export is confirmed and stored health information is removed." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Ready to Export</p><p className="mt-1 text-2xl font-bold text-violet-400">{readyMedDecs.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Needs Confirmation</p><p className="mt-1 text-2xl font-bold text-amber-400">{exportedMedDecs.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Test Cleanup</p><p className="mt-1 text-2xl font-bold text-emerald-400">{testMedDecs.length}</p></div>
        </div>

        {readyMedDecs.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Ready to Export</p></div>
            {readyMedDecs.map((m, i) => (
              <Link key={m.id} href={medDecHref(m.id)} className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-100">{m.worker_name || 'Unknown Worker'}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmtDate(m.submitted_at)} · {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) === 1 ? '' : 's'}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${MED_DEC_STATUS_COLORS[m.medic_review_status]}`}>{m.medic_review_status}</span>
              </Link>
            ))}
          </div>
        )}

        {exportedMedDecs.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Export Confirmation Required</p>
            </div>
            {medDecError && <p className="text-sm text-red-400">{medDecError}</p>}
            <div className="rounded-xl border border-slate-700/50 overflow-hidden">
              {exportedMedDecs.map((m, i) => (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                  <Link href={medDecHref(m.id)} className="flex-1 text-left hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{m.worker_name || 'Unknown Worker'}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(m.submitted_at)} · {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) === 1 ? '' : 's'}</p>
                    </div>
                  </Link>
                  <a href={pdfHref('medication_declaration', m.id)} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm hover:bg-slate-700/50">Download again</a>
                  <button onClick={() => confirmExportAndPurge({ formType: 'medication_declaration', id: m.id, setError: setMedDecError })} disabled={confirmingExportId === m.id} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50">
                    {confirmingExportId === m.id ? 'Removing…' : 'Confirm and remove PHI'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {testMedDecs.length > 0 && (
          <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Reviewed Test Records</p>
                <p className="mt-1 text-sm text-slate-400">PDF export is disabled during testing. Purge these records when they are no longer needed.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedTestMedDecIds(selectedTestMedDecIds.size === testMedDecs.length ? new Set() : new Set(testMedDecs.map((m) => m.id)))} className="text-sm text-cyan-400 hover:underline">
                  {selectedTestMedDecIds.size === testMedDecs.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedTestMedDecIds.size > 0 && (
                  <button onClick={() => purgeMedDecs(selectedTestMedDecIds, () => setSelectedTestMedDecIds(new Set()))} disabled={purgingMedDecs} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {purgingMedDecs ? 'Purging…' : `Purge test records (${selectedTestMedDecIds.size})`}
                  </button>
                )}
              </div>
            </div>
            {medDecError && <p className="text-sm text-red-400">{medDecError}</p>}
            <div className="rounded-xl border border-emerald-500/20 overflow-hidden">
              {testMedDecs.map((m, i) => (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-emerald-500/20' : ''}`}>
                  <input type="checkbox" checked={selectedTestMedDecIds.has(m.id)} onChange={() => toggleSelected(setSelectedTestMedDecIds, m.id)} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer" />
                  <Link href={medDecHref(m.id)} className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{m.worker_name || 'Unknown Worker'}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(m.submitted_at)} · {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) === 1 ? '' : 's'}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${MED_DEC_STATUS_COLORS[m.medic_review_status]}`}>{m.medic_review_status}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <SectionHeader title="Psychosocial Cases" subtitle="Reviewed psychosocial support and post-incident welfare cases stay here until export is confirmed. Wellbeing pulses are excluded." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Ready to Export</p><p className="mt-1 text-2xl font-bold text-violet-400">{readyPsychosocial.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Needs Confirmation</p><p className="mt-1 text-2xl font-bold text-amber-400">{exportedPsychosocial.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Test Cleanup</p><p className="mt-1 text-2xl font-bold text-emerald-400">{testPsychosocial.length}</p></div>
        </div>

        {readyPsychosocial.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Ready to Export</p></div>
            {readyPsychosocial.map((item, i) => (
              <Link key={item.id} href={psychosocialHref(item.id)} className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-100">{getPsychosocialWorkerName(item)}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {fmtDate(item.submitted_at)} · {formatPsychosocialWorkflowKind(getPsychosocialWorkflowKind(item) || 'support_check_in')} · {formatPsychosocialRiskLevel(item.payload.scoreSummary.derivedPulseRiskLevel)} risk
                  </p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Reviewed
                </span>
              </Link>
            ))}
          </div>
        )}

        {exportedPsychosocial.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Export Confirmation Required</p>
            </div>
            {psychosocialError && <p className="text-sm text-red-400">{psychosocialError}</p>}
            <div className="rounded-xl border border-slate-700/50 overflow-hidden">
              {exportedPsychosocial.map((item, i) => (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                  <Link href={psychosocialHref(item.id)} className="flex-1 text-left hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{getPsychosocialWorkerName(item)}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(item.submitted_at)} · {formatPsychosocialWorkflowKind(getPsychosocialWorkflowKind(item) || 'support_check_in')} · {formatPsychosocialRiskLevel(item.payload.scoreSummary.derivedPulseRiskLevel)} risk</p>
                    </div>
                  </Link>
                  <a href={pdfHref('psychosocial_health', item.id)} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm hover:bg-slate-700/50">Download again</a>
                  <button onClick={() => confirmExportAndPurge({ formType: 'psychosocial_health', id: item.id, setError: setPsychosocialError })} disabled={confirmingExportId === item.id} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50">
                    {confirmingExportId === item.id ? 'Removing…' : 'Confirm and remove PHI'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {testPsychosocial.length > 0 && (
          <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Reviewed Test Records</p>
                <p className="mt-1 text-sm text-slate-400">PDF export is disabled during testing. Purge these records when they are no longer needed.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedTestPsychosocialIds(selectedTestPsychosocialIds.size === testPsychosocial.length ? new Set() : new Set(testPsychosocial.map((item) => item.id)))} className="text-sm text-cyan-400 hover:underline">
                  {selectedTestPsychosocialIds.size === testPsychosocial.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedTestPsychosocialIds.size > 0 && (
                  <button onClick={() => purgePsychosocialAssessments(selectedTestPsychosocialIds, () => setSelectedTestPsychosocialIds(new Set()))} disabled={purgingPsychosocial} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {purgingPsychosocial ? 'Purging…' : `Purge test records (${selectedTestPsychosocialIds.size})`}
                  </button>
                )}
              </div>
            </div>
            {psychosocialError && <p className="text-sm text-red-400">{psychosocialError}</p>}
            <div className="rounded-xl border border-emerald-500/20 overflow-hidden">
              {testPsychosocial.map((item, i) => (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-emerald-500/20' : ''}`}>
                  <input type="checkbox" checked={selectedTestPsychosocialIds.has(item.id)} onChange={() => toggleSelected(setSelectedTestPsychosocialIds, item.id)} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer" />
                  <Link href={psychosocialHref(item.id)} className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{getPsychosocialWorkerName(item)}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(item.submitted_at)} · {formatPsychosocialWorkflowKind(getPsychosocialWorkflowKind(item) || 'support_check_in')} · {formatPsychosocialRiskLevel(item.payload.scoreSummary.derivedPulseRiskLevel)} risk</p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Reviewed
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className="space-y-4">
        <SectionHeader title="Fatigue Assessments" subtitle="Medic-reviewed fatigue outcomes stay here until export is confirmed and stored health information is removed." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Ready to Export</p><p className="mt-1 text-2xl font-bold text-violet-400">{readyFatigue.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Needs Confirmation</p><p className="mt-1 text-2xl font-bold text-amber-400">{exportedFatigue.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Test Cleanup</p><p className="mt-1 text-2xl font-bold text-emerald-400">{testFatigue.length}</p></div>
        </div>

        {readyFatigue.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Ready to Export</p></div>
            {readyFatigue.map((item, i) => (
              <Link key={item.id} href={fatigueHref(item.id)} className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-100">{item.payload.workerAssessment.workerNameSnapshot || 'Unknown Worker'}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {fmtDate(item.submitted_at)} · {formatFatigueDecision(item.review_payload.fitForWorkDecision)}
                  </p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Reviewed
                </span>
              </Link>
            ))}
          </div>
        )}

        {exportedFatigue.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Export Confirmation Required</p>
            </div>
            {fatigueError && <p className="text-sm text-red-400">{fatigueError}</p>}
            <div className="rounded-xl border border-slate-700/50 overflow-hidden">
              {exportedFatigue.map((item, i) => (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                  <Link href={fatigueHref(item.id)} className="flex-1 text-left hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{item.payload.workerAssessment.workerNameSnapshot || 'Unknown Worker'}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(item.submitted_at)} · {formatFatigueDecision(item.review_payload.fitForWorkDecision)}</p>
                    </div>
                  </Link>
                  <a href={pdfHref('fatigue_assessment', item.id)} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm hover:bg-slate-700/50">Download again</a>
                  <button onClick={() => confirmExportAndPurge({ formType: 'fatigue_assessment', id: item.id, setError: setFatigueError })} disabled={confirmingExportId === item.id} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50">
                    {confirmingExportId === item.id ? 'Removing…' : 'Confirm and remove PHI'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {testFatigue.length > 0 && (
          <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Reviewed Test Records</p>
                <p className="mt-1 text-sm text-slate-400">PDF export is disabled during testing. Purge these records when they are no longer needed.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedTestFatigueIds(selectedTestFatigueIds.size === testFatigue.length ? new Set() : new Set(testFatigue.map((item) => item.id)))} className="text-sm text-cyan-400 hover:underline">
                  {selectedTestFatigueIds.size === testFatigue.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedTestFatigueIds.size > 0 && (
                  <button onClick={() => purgeFatigueAssessments(selectedTestFatigueIds, () => setSelectedTestFatigueIds(new Set()))} disabled={purgingFatigue} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {purgingFatigue ? 'Purging…' : `Purge test records (${selectedTestFatigueIds.size})`}
                  </button>
                )}
              </div>
            </div>
            {fatigueError && <p className="text-sm text-red-400">{fatigueError}</p>}
            <div className="rounded-xl border border-emerald-500/20 overflow-hidden">
              {testFatigue.map((item, i) => (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-emerald-500/20' : ''}`}>
                  <input type="checkbox" checked={selectedTestFatigueIds.has(item.id)} onChange={() => toggleSelected(setSelectedTestFatigueIds, item.id)} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer" />
                  <Link href={fatigueHref(item.id)} className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{item.payload.workerAssessment.workerNameSnapshot || 'Unknown Worker'}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(item.submitted_at)} · {formatFatigueDecision(item.review_payload.fitForWorkDecision)}</p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Reviewed
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
type MedicExportsSubmission = Pick<
  Submission,
  'id' | 'business_id' | 'site_id' | 'worker_snapshot' | 'visit_date' | 'shift_type' | 'status' | 'submitted_at' | 'exported_at' | 'export_confirmed_at' | 'phi_purged_at' | 'is_test'
>

type MedicExportsMedDec = Pick<
  MedicationDeclaration,
  'id' | 'business_id' | 'site_id' | 'worker_name' | 'submitted_at' | 'medic_review_status' | 'exported_at' | 'export_confirmed_at' | 'phi_purged_at' | 'medications' | 'is_test'
>

type MedicExportsFatigue = Pick<
  FatigueAssessment,
  'id' | 'business_id' | 'site_id' | 'status' | 'payload' | 'review_payload' | 'submitted_at' | 'exported_at' | 'export_confirmed_at' | 'phi_purged_at' | 'is_test'
>

type MedicExportsPsychosocial = Pick<
  PsychosocialAssessment,
  'id' | 'business_id' | 'site_id' | 'status' | 'payload' | 'review_payload' | 'submitted_at' | 'exported_at' | 'export_confirmed_at' | 'phi_purged_at' | 'is_test'
>
