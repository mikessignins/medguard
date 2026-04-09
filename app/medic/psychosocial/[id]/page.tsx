import { notFound, redirect } from 'next/navigation'
import PsychosocialDetail from '@/components/medic/PsychosocialDetail'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import { parseQueue } from '@/lib/queue-params'
import { getRequestClient, getRequestUser, getRequestUserAccount } from '@/lib/supabase/request-cache'
import type { PsychosocialAssessment } from '@/lib/types'

function parsePsychosocialAssessment(raw: Record<string, unknown>): PsychosocialAssessment {
  return {
    id: String(raw.id ?? ''),
    business_id: String(raw.business_id ?? ''),
    site_id: String(raw.site_id ?? ''),
    worker_id: String(raw.worker_id ?? ''),
    module_key: 'psychosocial_health',
    module_version: Number(raw.module_version ?? 1),
    status: String(raw.status ?? 'awaiting_medic_review') as PsychosocialAssessment['status'],
    payload: raw.payload as PsychosocialAssessment['payload'],
    review_payload: (raw.review_payload as PsychosocialAssessment['review_payload']) ?? {},
    submitted_at: String(raw.submitted_at ?? ''),
    reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
    reviewed_by: raw.reviewed_by ? String(raw.reviewed_by) : null,
    exported_at: raw.exported_at ? String(raw.exported_at) : null,
    exported_by_name: raw.exported_by_name ? String(raw.exported_by_name) : null,
    phi_purged_at: raw.phi_purged_at ? String(raw.phi_purged_at) : null,
    is_test: typeof raw.is_test === 'boolean' ? raw.is_test : null,
  }
}

export default async function MedicPsychosocialPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { queue?: string; pos?: string; site?: string }
}) {
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account || account.role !== 'medic') redirect('/')
  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) redirect('/expired')

  const supabase = await getRequestClient()

  const { data: raw } = await supabase
    .from('module_submissions')
    .select('*')
    .eq('id', params.id)
    .eq('module_key', 'psychosocial_health')
    .single()

  if (!raw) notFound()
  if (!hasMedicScopeAccess(account, raw)) notFound()

  const workflowKind = raw.payload?.workerPulse?.workflowKind
    ?? (raw.payload?.postIncidentWelfare ? 'post_incident_psychological_welfare' : null)

  if (!['support_check_in', 'post_incident_psychological_welfare'].includes(workflowKind ?? '')) {
    redirect(`/medic/psychosocial?site=${encodeURIComponent(searchParams.site || String(raw.site_id || ''))}`)
  }

  if (raw.status === 'awaiting_medic_review' || raw.status === 'review_recommended') {
    const reviewStartedAt = new Date().toISOString()
    await supabase
      .from('module_submissions')
      .update({
        status: 'in_medic_review',
        reviewed_at: reviewStartedAt,
        reviewed_by: user.id,
        review_payload: {
          ...(typeof raw.review_payload === 'object' && raw.review_payload ? raw.review_payload : {}),
          reviewStartedAt,
          reviewedByUserId: user.id,
          reviewedByName: account.display_name,
          caseOwnerUserId: user.id,
          caseOwnerName: account.display_name,
        },
      })
      .eq('id', raw.id)
      .in('status', ['awaiting_medic_review', 'review_recommended'])
    raw.status = 'in_medic_review'
    raw.reviewed_at = reviewStartedAt
    raw.reviewed_by = user.id
    raw.review_payload = {
      ...(typeof raw.review_payload === 'object' && raw.review_payload ? raw.review_payload : {}),
      reviewStartedAt,
      reviewedByUserId: user.id,
      reviewedByName: account.display_name,
      caseOwnerUserId: user.id,
      caseOwnerName: account.display_name,
    }
  }

  const [{ data: site }, { data: business }] = await Promise.all([
    supabase.from('sites').select('name').eq('id', raw.site_id).single(),
    supabase.from('businesses').select('name').eq('id', raw.business_id).single(),
  ])

  const queueContext = parseQueue(searchParams)
  const backHref = `/medic/psychosocial?site=${encodeURIComponent(searchParams.site || String(raw.site_id || ''))}`

  return (
    <PsychosocialDetail
      assessment={parsePsychosocialAssessment(raw)}
      siteName={site?.name || String(raw.site_id)}
      businessName={business?.name || String(raw.business_id)}
      currentUserId={user.id}
      queueContext={queueContext}
      backHref={backHref}
    />
  )
}
