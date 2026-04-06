'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const EVENT_TYPES = [
  ['witnessed_serious_injury', 'Witnessed serious injury'],
  ['witnessed_death', 'Witnessed death'],
  ['involved_in_cpr', 'Involved in CPR'],
  ['personally_injured', 'Personally injured'],
  ['serious_near_miss', 'Serious near miss'],
  ['distressing_behavioural_incident', 'Distressing behavioural incident'],
  ['other', 'Other'],
] as const

export default function PostIncidentWelfareForm({
  sites,
  workers,
  initialSite,
}: {
  sites: Array<{ id: string; name: string }>
  workers: Array<{ id: string; display_name: string; site_ids: string[] }>
  initialSite?: string
}) {
  const router = useRouter()
  const [siteId, setSiteId] = useState(initialSite || sites[0]?.id || '')
  const [workerNameSnapshot, setWorkerNameSnapshot] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [jobRole, setJobRole] = useState('')
  const [linkedIncidentOrCaseId, setLinkedIncidentOrCaseId] = useState('')
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number][0]>('witnessed_serious_injury')
  const [eventDateTime, setEventDateTime] = useState('')
  const [natureOfExposure, setNatureOfExposure] = useState('')
  const [followUpScheduledAt, setFollowUpScheduledAt] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [initialDefusingOffered, setInitialDefusingOffered] = useState(true)
  const [normalReactionsExplained, setNormalReactionsExplained] = useState(true)
  const [supportPersonContacted, setSupportPersonContacted] = useState(false)
  const [eapReferralOffered, setEapReferralOffered] = useState(false)
  const [externalPsychologyReferralOffered, setExternalPsychologyReferralOffered] = useState(false)
  const [confidentialityAcknowledged, setConfidentialityAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const workersForSite = useMemo(
    () => workers.filter((worker) => worker.site_ids.includes(siteId)),
    [siteId, workers],
  )

  const resolvedWorkerId = useMemo(() => {
    const manualId = workerId.trim()
    if (manualId) return manualId

    const matches = workersForSite.filter(
      (worker) => worker.display_name.trim().toLocaleLowerCase() === workerNameSnapshot.trim().toLocaleLowerCase(),
    )

    return matches.length === 1 ? matches[0].id : null
  }, [workerId, workerNameSnapshot, workersForSite])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/psychosocial-assessments/post-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          workerNameSnapshot,
          workerId: resolvedWorkerId,
          jobRole: jobRole.trim() || null,
          linkedIncidentOrCaseId: linkedIncidentOrCaseId.trim() || null,
          eventType,
          eventDateTime,
          natureOfExposure,
          followUpScheduledAt: followUpScheduledAt || null,
          reviewNotes: reviewNotes.trim() || null,
          initialDefusingOffered,
          normalReactionsExplained,
          supportPersonContacted,
          eapReferralOffered,
          externalPsychologyReferralOffered,
          confidentialityAcknowledged,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Failed to create post-incident welfare case.')
        return
      }

      router.push(`/medic/psychosocial/${data.id}?site=${encodeURIComponent(siteId)}`)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-3xl border border-[var(--border-md)] bg-[var(--bg-card)] p-6 shadow-sm"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-3)]">Workflow 3</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-1)]">New Post-Incident Psychological Welfare Case</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-2)]">
          Use this medic-led workflow after a traumatic or clinically significant event. It creates an identifiable welfare case inside the psychosocial umbrella module.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-3)]">
          Enter the worker&apos;s name as it appears in MedGuard and we&apos;ll match the registered worker account for you when possible. The worker account ID is now only a fallback.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Site</span>
          <select value={siteId} onChange={(event) => setSiteId(event.target.value)} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]">
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Worker name</span>
          <input value={workerNameSnapshot} onChange={(event) => setWorkerNameSnapshot(event.target.value)} list="post-incident-worker-names" className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]" required />
          <datalist id="post-incident-worker-names">
            {workersForSite.map((worker) => (
              <option key={worker.id} value={worker.display_name} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Worker account ID</span>
          <input value={workerId} onChange={(event) => setWorkerId(event.target.value)} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]" placeholder="Optional fallback if the worker name is not matched" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Job role</span>
          <input value={jobRole} onChange={(event) => setJobRole(event.target.value)} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Linked incident or case ID</span>
          <input value={linkedIncidentOrCaseId} onChange={(event) => setLinkedIncidentOrCaseId(event.target.value)} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Event type</span>
          <select value={eventType} onChange={(event) => setEventType(event.target.value as (typeof EVENT_TYPES)[number][0])} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]">
            {EVENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Event date and time</span>
          <input type="datetime-local" value={eventDateTime} onChange={(event) => setEventDateTime(event.target.value)} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]" required />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Nature of exposure</span>
          <textarea value={natureOfExposure} onChange={(event) => setNatureOfExposure(event.target.value)} rows={4} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]" required />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Initial review notes</span>
          <textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={4} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]" />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-[var(--text-1)]">Follow-up scheduled at</span>
          <input type="datetime-local" value={followUpScheduledAt} onChange={(event) => setFollowUpScheduledAt(event.target.value)} className="w-full rounded-2xl border border-[var(--border-md)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-1)]" />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {[
          ['Initial defusing offered', initialDefusingOffered, setInitialDefusingOffered],
          ['Normal reactions explained', normalReactionsExplained, setNormalReactionsExplained],
          ['Support person contacted', supportPersonContacted, setSupportPersonContacted],
          ['EAP referral offered', eapReferralOffered, setEapReferralOffered],
          ['External psychology referral offered', externalPsychologyReferralOffered, setExternalPsychologyReferralOffered],
          ['Confidentiality acknowledged', confidentialityAcknowledged, setConfidentialityAcknowledged],
        ].map(([label, value, setter]) => (
          <label key={label as string} className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-md)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-1)]">
            <input type="checkbox" checked={value as boolean} onChange={(event) => (setter as (v: boolean) => void)(event.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500" />
            {label as string}
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.push('/medic/psychosocial')} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50">
          {saving ? 'Creating...' : 'Create welfare case'}
        </button>
      </div>
    </form>
  )
}
