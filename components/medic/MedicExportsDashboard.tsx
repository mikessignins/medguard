'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { MedDecReviewStatus, MedicationDeclaration, Site, Submission, SubmissionStatus } from '@/lib/types'

const AUTO_PURGE_DAYS = 7
const FINAL_SUBMISSION_STATUSES: SubmissionStatus[] = ['Approved', 'Requires Follow-up']
const FINAL_MED_DEC_STATUSES: MedDecReviewStatus[] = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']

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

function daysUntilPurge(exportedAt: string): number {
  const purgeDate = new Date(new Date(exportedAt).getTime() + AUTO_PURGE_DAYS * 86400000)
  return Math.ceil((purgeDate.getTime() - Date.now()) / 86400000)
}

function PurgeCountdown({ exportedAt }: { exportedAt: string }) {
  const days = daysUntilPurge(exportedAt)
  if (days <= 0) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Auto-purging</span>
  const color = days <= 1
    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
    : days <= 3
      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
      : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>Purges in {days}d</span>
}

function SitePicker({
  sites,
  activeTab,
  onChange,
  badgeCounts,
}: {
  sites: Site[]
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
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all duration-150 shrink-0 ${
              isActive
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            {site.name}
            {count > 0 && <span className="bg-cyan-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">{count}</span>}
          </button>
        )
      })}
    </div>
  )
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
  sites: Site[]
  submissions: Submission[]
  medDeclarations: MedicationDeclaration[]
  initialSite?: string
}

export default function MedicExportsDashboard({ sites, submissions, medDeclarations, initialSite }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(initialSite || sites[0]?.id || '')
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(new Set())
  const [selectedMedDecIds, setSelectedMedDecIds] = useState<Set<string>>(new Set())
  const [submissionError, setSubmissionError] = useState('')
  const [medDecError, setMedDecError] = useState('')
  const [purgingSubmissions, setPurgingSubmissions] = useState(false)
  const [purgingMedDecs, setPurgingMedDecs] = useState(false)

  const siteSubmissions = submissions.filter((s) => s.site_id === activeTab && s.status !== 'Recalled')
  const readySubmissions = siteSubmissions.filter((s) => !s.exported_at && !s.phi_purged_at && FINAL_SUBMISSION_STATUSES.includes(s.status))
  const exportedSubmissions = siteSubmissions.filter((s) => !!s.exported_at && !s.phi_purged_at)
  const purgedSubmissions = siteSubmissions.filter((s) => !!s.phi_purged_at)

  const siteMedDecs = medDeclarations.filter((m) => m.site_id === activeTab)
  const readyMedDecs = siteMedDecs.filter((m) => !m.exported_at && !m.phi_purged_at && FINAL_MED_DEC_STATUSES.includes(m.medic_review_status))
  const exportedMedDecs = siteMedDecs.filter((m) => !!m.exported_at && !m.phi_purged_at)
  const purgedMedDecs = siteMedDecs.filter((m) => !!m.phi_purged_at)

  const badgeCounts = Object.fromEntries(
    sites.map((site) => {
      const subCount = submissions.filter((s) => s.site_id === site.id && s.status !== 'Recalled' && (!s.phi_purged_at && (FINAL_SUBMISSION_STATUSES.includes(s.status) || !!s.exported_at) || !!s.phi_purged_at)).length
      const medCount = medDeclarations.filter((m) => m.site_id === site.id && (!m.phi_purged_at && (FINAL_MED_DEC_STATUSES.includes(m.medic_review_status) || !!m.exported_at) || !!m.phi_purged_at)).length
      return [site.id, subCount + medCount]
    })
  )

  function openSubmission(id: string) {
    router.push(`/medic/submissions/${id}?view=exports&site=${activeTab}`)
  }

  function openMedDec(id: string) {
    router.push(`/medic/med-declarations/${id}?view=exports&site=${activeTab}`)
  }

  function toggleSelected(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function purgeSubmissions() {
    if (selectedSubmissionIds.size === 0) return
    setPurgingSubmissions(true)
    setSubmissionError('')
    try {
      const res = await fetch('/api/declarations/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedSubmissionIds) }),
      })
      if (!res.ok) {
        setSubmissionError(await res.text())
        return
      }
      setSelectedSubmissionIds(new Set())
      router.refresh()
    } catch {
      setSubmissionError('Network error — please try again.')
    } finally {
      setPurgingSubmissions(false)
    }
  }

  async function purgeMedDecs() {
    if (selectedMedDecIds.size === 0) return
    setPurgingMedDecs(true)
    setMedDecError('')
    try {
      const res = await fetch('/api/medication-declarations/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedMedDecIds) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMedDecError(data.error || 'Purge failed')
        return
      }
      setSelectedMedDecIds(new Set())
      router.refresh()
    } catch {
      setMedDecError('Network error — please try again.')
    } finally {
      setPurgingMedDecs(false)
    }
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h1 className="text-2xl font-bold text-slate-100">Exports &amp; Retention</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Reviewed declarations leave the active queue and live here. Once exported, PDFs stay available for {AUTO_PURGE_DAYS} days unless you purge them sooner.
        </p>
      </div>

      <SitePicker sites={sites} activeTab={activeTab} onChange={setActiveTab} badgeCounts={badgeCounts} />

      <div className="space-y-4">
        <SectionHeader title="Emergency Medical Forms" subtitle="Final decisions become export-ready here and stay re-exportable until purged." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Ready to Export</p><p className="mt-1 text-2xl font-bold text-cyan-400">{readySubmissions.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Exported</p><p className="mt-1 text-2xl font-bold text-amber-400">{exportedSubmissions.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Purged</p><p className="mt-1 text-2xl font-bold text-slate-400">{purgedSubmissions.length}</p></div>
        </div>

        {readySubmissions.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Ready to Export</p></div>
            {readySubmissions.map((sub, i) => (
              <button key={sub.id} onClick={() => openSubmission(sub.id)} className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-100">{sub.worker_snapshot?.fullName || 'Unknown Worker'}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmtDate(sub.visit_date)} · {sub.shift_type || 'N/A'}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${SUBMISSION_STATUS_COLORS[sub.status]}`}>{sub.status}</span>
              </button>
            ))}
          </div>
        )}

        {exportedSubmissions.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Exported and Available</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedSubmissionIds(selectedSubmissionIds.size === exportedSubmissions.length ? new Set() : new Set(exportedSubmissions.map((sub) => sub.id)))} className="text-sm text-cyan-400 hover:underline">
                  {selectedSubmissionIds.size === exportedSubmissions.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedSubmissionIds.size > 0 && (
                  <button onClick={purgeSubmissions} disabled={purgingSubmissions} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {purgingSubmissions ? 'Purging…' : `Purge selected (${selectedSubmissionIds.size})`}
                  </button>
                )}
              </div>
            </div>
            {submissionError && <p className="text-sm text-red-400">{submissionError}</p>}
            <div className="rounded-xl border border-slate-700/50 overflow-hidden">
              {exportedSubmissions.map((sub, i) => (
                <div key={sub.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                  <input type="checkbox" checked={selectedSubmissionIds.has(sub.id)} onChange={() => toggleSelected(setSelectedSubmissionIds, sub.id)} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer" />
                  <button onClick={() => openSubmission(sub.id)} className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{sub.worker_snapshot?.fullName || 'Unknown Worker'}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(sub.visit_date)} · {sub.shift_type || 'N/A'}</p>
                    </div>
                    {sub.exported_at && <PurgeCountdown exportedAt={sub.exported_at} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {purgedSubmissions.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Purged History</p></div>
            {purgedSubmissions.map((sub, i) => (
              <button key={sub.id} onClick={() => openSubmission(sub.id)} className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-800 transition-colors ${i > 0 ? 'border-t border-slate-800' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-400">PHI Purged</p>
                  <p className="text-sm text-slate-600 mt-1">{fmtDate(sub.visit_date)}</p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">Purged</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <SectionHeader title="Confidential Medication Declarations" subtitle="Final medication reviews stay here for export and the 7-day retention window." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Ready to Export</p><p className="mt-1 text-2xl font-bold text-violet-400">{readyMedDecs.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Exported</p><p className="mt-1 text-2xl font-bold text-amber-400">{exportedMedDecs.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Purged</p><p className="mt-1 text-2xl font-bold text-slate-400">{purgedMedDecs.length}</p></div>
        </div>

        {readyMedDecs.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Ready to Export</p></div>
            {readyMedDecs.map((m, i) => (
              <button key={m.id} onClick={() => openMedDec(m.id)} className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-100">{m.worker_name || 'Unknown Worker'}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmtDate(m.submitted_at)} · {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) === 1 ? '' : 's'}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${MED_DEC_STATUS_COLORS[m.medic_review_status]}`}>{m.medic_review_status}</span>
              </button>
            ))}
          </div>
        )}

        {exportedMedDecs.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Exported and Available</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedMedDecIds(selectedMedDecIds.size === exportedMedDecs.length ? new Set() : new Set(exportedMedDecs.map((m) => m.id)))} className="text-sm text-cyan-400 hover:underline">
                  {selectedMedDecIds.size === exportedMedDecs.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedMedDecIds.size > 0 && (
                  <button onClick={purgeMedDecs} disabled={purgingMedDecs} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {purgingMedDecs ? 'Purging…' : `Purge selected (${selectedMedDecIds.size})`}
                  </button>
                )}
              </div>
            </div>
            {medDecError && <p className="text-sm text-red-400">{medDecError}</p>}
            <div className="rounded-xl border border-slate-700/50 overflow-hidden">
              {exportedMedDecs.map((m, i) => (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? 'border-t border-slate-700/50' : ''}`}>
                  <input type="checkbox" checked={selectedMedDecIds.has(m.id)} onChange={() => toggleSelected(setSelectedMedDecIds, m.id)} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 cursor-pointer" />
                  <button onClick={() => openMedDec(m.id)} className="flex-1 text-left flex items-center justify-between hover:bg-slate-700/30 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
                    <div>
                      <p className="font-semibold text-slate-100">{m.worker_name || 'Unknown Worker'}</p>
                      <p className="text-sm text-slate-500 mt-1">{fmtDate(m.submitted_at)} · {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) === 1 ? '' : 's'}</p>
                    </div>
                    {m.exported_at && <PurgeCountdown exportedAt={m.exported_at} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {purgedMedDecs.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Purged History</p></div>
            {purgedMedDecs.map((m, i) => (
              <button key={m.id} onClick={() => openMedDec(m.id)} className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-800 transition-colors ${i > 0 ? 'border-t border-slate-800' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-400">PHI Purged</p>
                  <p className="text-sm text-slate-600 mt-1">{fmtDate(m.submitted_at)}</p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">Purged</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
