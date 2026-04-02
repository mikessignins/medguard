import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import SubmissionDetail from '@/components/medic/SubmissionDetail'
import { parseQueue } from '@/lib/queue-params'
import type { WorkerSnapshot, Decision, SubmissionStatus, ScriptUpload, MedicComment } from '@/lib/types'

function parseSnapshot(raw: unknown): WorkerSnapshot | null {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof obj !== 'object' || obj === null) return null
    return obj as WorkerSnapshot
  } catch {
    return null
  }
}

function parseDecision(raw: unknown): Decision | null {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof obj !== 'object' || obj === null) return null
    return obj as Decision
  } catch {
    return null
  }
}

function parseScriptUploads(raw: unknown): ScriptUpload[] {
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (u): u is ScriptUpload =>
        typeof u === 'object' && u !== null &&
        typeof u.medicationId === 'string' &&
        typeof u.storagePath === 'string'
    )
  } catch {
    return []
  }
}

function parseComments(raw: unknown): MedicComment[] {
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (c): c is MedicComment =>
        typeof c === 'object' && c !== null &&
        typeof c.id === 'string' &&
        typeof c.medic_user_id === 'string' &&
        typeof c.note === 'string'
    )
  } catch {
    return []
  }
}

function parseSiteSpecificAnswers(raw: unknown): Record<string, string> {
  if (!raw) return {}
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof obj !== 'object' || obj === null) return {}
    const entries = Object.entries(obj as Record<string, unknown>)
      .map(([key, value]) => [String(key), value == null ? '' : String(value)] as const)
      .filter(([key, value]) => key.trim().length > 0 && value.trim().length > 0)
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export default async function SubmissionPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { queue?: string; pos?: string; view?: string; site?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: raw } = await supabase.from('submissions').select('*').eq('id', params.id).single()

  if (!raw) notFound()

  // Auto-tag as In Review when a medic opens a New submission
  if (raw.status === 'New') {
    await supabase.from('submissions').update({ status: 'In Review' }).eq('id', raw.id)
    raw.status = 'In Review'
  }

  const [{ data: site }, { data: business }] = await Promise.all([
    supabase.from('sites').select('name').eq('id', raw.site_id).single(),
    supabase.from('businesses').select('name').eq('id', raw.business_id).single(),
  ])

  // Parse script uploads and generate fresh signed URLs (1 hour expiry)
  const rawUploads = parseScriptUploads(raw.script_uploads)
  const scriptUploads: ScriptUpload[] = await Promise.all(
    rawUploads.map(async (upload) => {
      const { data } = await supabase.storage
        .from('scripts')
        .createSignedUrl(upload.storagePath, 3600)
      return { ...upload, signedUrl: data?.signedUrl ?? null }
    })
  )

  // Sanitise all fields before passing to the client component
  const submission = {
    id: String(raw.id ?? ''),
    business_id: String(raw.business_id ?? ''),
    site_id: String(raw.site_id ?? ''),
    worker_id: String(raw.worker_id ?? ''),
    role: String(raw.role ?? ''),
    visit_date: raw.visit_date ? String(raw.visit_date) : null,
    shift_type: String(raw.shift_type ?? ''),
    status: String(raw.status ?? 'New') as SubmissionStatus,
    consent_given: Boolean(raw.consent_given),
    submitted_at: raw.submitted_at ? String(raw.submitted_at) : null,
    site_specific_answers: parseSiteSpecificAnswers(raw.site_specific_answers),
    exported_at: raw.exported_at ? String(raw.exported_at) : null,
    phi_purged_at: raw.phi_purged_at ? String(raw.phi_purged_at) : null,
    worker_snapshot: parseSnapshot(raw.worker_snapshot),
    decision: parseDecision(raw.decision),
    scriptUploads,
    comments: parseComments(raw.comments),
  }

  const queueContext = parseQueue(searchParams)
  const backHref = searchParams.view === 'exports'
    ? `/medic/exports${searchParams.site ? `?site=${encodeURIComponent(searchParams.site)}` : ''}`
    : `/medic${raw.site_id ? `?site=${encodeURIComponent(String(raw.site_id))}` : ''}`

  return (
    <SubmissionDetail
      submission={submission}
      siteName={site?.name || raw.site_id}
      businessName={business?.name || raw.business_id}
      currentUserId={user.id}
      queueContext={queueContext}
      backHref={backHref}
    />
  )
}
