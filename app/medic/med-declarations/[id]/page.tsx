import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import MedDecDetail from '@/components/medic/MedDecDetail'
import type { MedDecMedication, MedDecReviewStatus, ScriptUpload } from '@/lib/types'
import { parseQueue } from '@/lib/queue-params'

function parseMedications(raw: unknown): MedDecMedication[] {
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function parseScriptUploads(raw: unknown): ScriptUpload[] {
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (u): u is ScriptUpload =>
        typeof u === 'object' && u !== null && typeof u.storagePath === 'string'
    )
  } catch { return [] }
}

export default async function MedDecPage({ params, searchParams }: { params: { id: string }; searchParams: { queue?: string; pos?: string; view?: string; site?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: raw } = await supabase
    .from('medication_declarations')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!raw) notFound()

  // Auto-tag as In Review when a medic opens a Pending medication declaration
  if (!raw.medic_review_status || raw.medic_review_status === 'Pending') {
    await supabase
      .from('medication_declarations')
      .update({ medic_review_status: 'In Review' })
      .eq('id', raw.id)
    raw.medic_review_status = 'In Review'
  }

  const [{ data: site }, { data: business }] = await Promise.all([
    supabase.from('sites').select('name').eq('id', raw.site_id).single(),
    supabase.from('businesses').select('name').eq('id', raw.business_id).single(),
  ])

  const rawUploads = parseScriptUploads(raw.script_uploads)
  const scriptUploads: ScriptUpload[] = await Promise.all(
    rawUploads.map(async (upload) => {
      const { data } = await supabase.storage
        .from('scripts')
        .createSignedUrl(upload.storagePath, 3600)
      return { ...upload, signedUrl: data?.signedUrl ?? null }
    })
  )

  const medDec = {
    id: String(raw.id ?? ''),
    business_id: String(raw.business_id ?? ''),
    site_id: String(raw.site_id ?? ''),
    worker_id: String(raw.worker_id ?? ''),
    worker_name: String(raw.worker_name ?? ''),
    worker_dob: String(raw.worker_dob ?? ''),
    employer: String(raw.employer ?? ''),
    department: String(raw.department ?? ''),
    job_title: String(raw.job_title ?? ''),
    has_recent_injury_or_illness: Boolean(raw.has_recent_injury_or_illness),
    has_side_effects: Boolean(raw.has_side_effects),
    medications: parseMedications(raw.medications),
    submitted_at: String(raw.submitted_at ?? ''),
    medic_review_status: (raw.medic_review_status || 'Pending') as MedDecReviewStatus,
    medic_name: String(raw.medic_name ?? ''),
    medic_comments: String(raw.medic_comments ?? ''),
    review_required: Boolean(raw.review_required),
    medic_reviewed_at: raw.medic_reviewed_at ? String(raw.medic_reviewed_at) : null,
    script_uploads: rawUploads,
    scriptUploads,
    exported_at: raw.exported_at ? String(raw.exported_at) : null,
    phi_purged_at: raw.phi_purged_at ? String(raw.phi_purged_at) : null,
  }

  const queueContext = parseQueue(searchParams)
  const backHref = searchParams.view === 'exports'
    ? `/medic/exports${searchParams.site ? `?site=${encodeURIComponent(searchParams.site)}` : ''}`
    : `/medic${raw.site_id ? `?site=${encodeURIComponent(String(raw.site_id))}` : ''}`

  return (
    <MedDecDetail
      medDec={medDec}
      siteName={site?.name || raw.site_id}
      businessName={business?.name || raw.business_id}
      queueContext={queueContext}
      backHref={backHref}
    />
  )
}
