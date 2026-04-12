import { redirect, notFound } from 'next/navigation'
import SubmissionDetail from '@/components/medic/SubmissionDetail'
import { parseQueue } from '@/lib/queue-params'
import type { WorkerSnapshot, Decision, SubmissionStatus, ScriptUpload } from '@/lib/types'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import { parseSubmissionComments } from '@/lib/submission-comments'
import { getRequestClient, getRequestUser, getRequestUserAccount } from '@/lib/supabase/request-cache'

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
  params: Promise<{ id: string }>
  searchParams: Promise<{ queue?: string; pos?: string; view?: string; site?: string }>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account || account.role !== 'medic' || account.is_inactive) redirect('/')

  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) {
    redirect('/expired')
  }

  const supabase = await getRequestClient()

  const { data: raw } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', resolvedParams.id)
    .single()

  if (!raw) notFound()
  if (!hasMedicScopeAccess(account, raw)) notFound()

  // Auto-tag as In Review when a medic opens a New submission
  if (raw.status === 'New') {
    await supabase.rpc('review_emergency_submission', {
      p_submission_id: raw.id,
      p_status: 'In Review',
      p_note: null,
      p_expected_version: raw.version ?? null,
    })
    raw.status = 'In Review'
  }

  const [{ data: site }, { data: business }, { data: commentRows, error: commentError }] = await Promise.all([
    supabase.from('sites').select('name').eq('id', raw.site_id).single(),
    supabase.from('businesses').select('name').eq('id', raw.business_id).single(),
    supabase
      .from('submission_comments')
      .select('id, medic_user_id, medic_name, note, outcome, created_at, edited_at')
      .eq('submission_id', raw.id)
      .order('created_at', { ascending: true }),
  ])

  if (commentError) {
    console.error('[medic/submissions/[id]] failed to load comments:', commentError)
  }

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
  const comments =
    commentRows && commentRows.length > 0
      ? parseSubmissionComments(commentRows)
      : parseSubmissionComments(raw.comments)

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
    comments,
  }

  const queueContext = parseQueue(resolvedSearchParams)
  const backHref = resolvedSearchParams.view === 'exports'
    ? `/medic/exports${resolvedSearchParams.site ? `?site=${encodeURIComponent(resolvedSearchParams.site)}` : ''}`
    : `/medic/emergency${raw.site_id ? `?site=${encodeURIComponent(String(raw.site_id))}` : ''}`

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
