import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import FatigueDetail from '@/components/medic/FatigueDetail'
import { parseQueue } from '@/lib/queue-params'
import type { FatigueAssessment } from '@/lib/types'

function parseFatigueAssessment(raw: Record<string, unknown>): FatigueAssessment {
  return {
    id: String(raw.id ?? ''),
    business_id: String(raw.business_id ?? ''),
    site_id: String(raw.site_id ?? ''),
    worker_id: String(raw.worker_id ?? ''),
    module_key: 'fatigue_assessment',
    module_version: Number(raw.module_version ?? 1),
    status: String(raw.status ?? 'awaiting_medic_review') as FatigueAssessment['status'],
    payload: raw.payload as FatigueAssessment['payload'],
    review_payload: (raw.review_payload as FatigueAssessment['review_payload']) ?? {},
    submitted_at: String(raw.submitted_at ?? ''),
    reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
    reviewed_by: raw.reviewed_by ? String(raw.reviewed_by) : null,
    exported_at: raw.exported_at ? String(raw.exported_at) : null,
    phi_purged_at: raw.phi_purged_at ? String(raw.phi_purged_at) : null,
  }
}

export default async function MedicFatiguePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { queue?: string; pos?: string; site?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, display_name')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'medic') redirect('/')

  const { data: raw } = await supabase
    .from('module_submissions')
    .select('*')
    .eq('id', params.id)
    .eq('module_key', 'fatigue_assessment')
    .single()

  if (!raw) notFound()

  if (raw.status === 'awaiting_medic_review') {
    await supabase
      .from('module_submissions')
      .update({
        status: 'in_medic_review',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        review_payload: {
          ...(typeof raw.review_payload === 'object' && raw.review_payload ? raw.review_payload : {}),
          reviewStartedAt: new Date().toISOString(),
          reviewedByUserId: user.id,
          reviewedByName: account.display_name,
        },
      })
      .eq('id', raw.id)
      .eq('status', 'awaiting_medic_review')
    raw.status = 'in_medic_review'
  }

  const [{ data: site }, { data: business }] = await Promise.all([
    supabase.from('sites').select('name').eq('id', raw.site_id).single(),
    supabase.from('businesses').select('name').eq('id', raw.business_id).single(),
  ])

  const queueContext = parseQueue(searchParams)
  const backHref = `/medic/fatigue?site=${encodeURIComponent(searchParams.site || String(raw.site_id || ''))}`

  return (
    <FatigueDetail
      assessment={parseFatigueAssessment(raw)}
      siteName={site?.name || String(raw.site_id)}
      businessName={business?.name || String(raw.business_id)}
      queueContext={queueContext}
      backHref={backHref}
    />
  )
}
