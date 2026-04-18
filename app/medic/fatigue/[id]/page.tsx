import { redirect, notFound } from 'next/navigation'
import FatigueDetail from '@/components/medic/FatigueDetail'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import { parseQueue } from '@/lib/queue-params'
import { getRequestClient, getRequestUser, getRequestUserAccount } from '@/lib/supabase/request-cache'
import type { FatigueAssessment } from '@/lib/types'
import { parseSubmissionComments } from '@/lib/submission-comments'

function isMissingModuleReviewRpc(message: string | null | undefined) {
  return !!message && /function .*review_module_submission.* does not exist|could not find the function .*review_module_submission/i.test(message)
}

function normalizeFatigueStatus(value: unknown): FatigueAssessment['status'] {
  const status = String(value ?? 'awaiting_medic_review')
  switch (status) {
    case 'in_review':
      return 'in_medic_review'
    case 'reviewed':
      return 'resolved'
    case 'worker_only_complete':
    case 'awaiting_medic_review':
    case 'in_medic_review':
    case 'resolved':
      return status
    default:
      return 'awaiting_medic_review'
  }
}

function parseFatigueAssessment(raw: Record<string, unknown>): FatigueAssessment {
  return {
    id: String(raw.id ?? ''),
    business_id: String(raw.business_id ?? ''),
    site_id: String(raw.site_id ?? ''),
    worker_id: String(raw.worker_id ?? ''),
    module_key: 'fatigue_assessment',
    module_version: Number(raw.module_version ?? 1),
    status: normalizeFatigueStatus(raw.status),
    payload: raw.payload as FatigueAssessment['payload'],
    review_payload: (raw.review_payload as FatigueAssessment['review_payload']) ?? {},
    submitted_at: String(raw.submitted_at ?? ''),
    reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
    reviewed_by: raw.reviewed_by ? String(raw.reviewed_by) : null,
    exported_at: raw.exported_at ? String(raw.exported_at) : null,
    exported_by_name: raw.exported_by_name ? String(raw.exported_by_name) : null,
    export_confirmed_at: raw.export_confirmed_at ? String(raw.export_confirmed_at) : null,
    phi_purged_at: raw.phi_purged_at ? String(raw.phi_purged_at) : null,
  }
}

export default async function MedicFatiguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ queue?: string; pos?: string; site?: string }>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account || account.role !== 'medic' || account.is_inactive) redirect('/')
  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) redirect('/expired')

  const supabase = await getRequestClient()

  async function claimFatigueReview(submissionId: string, reviewPayload: Record<string, unknown>) {
    const preferred = await supabase.rpc('review_module_submission', {
      p_submission_id: submissionId,
      p_module_key: 'fatigue_assessment',
      p_next_status: 'in_medic_review',
      p_review_payload: reviewPayload,
      p_expected_status: 'awaiting_medic_review',
      p_expected_reviewed_by: null,
    })

    if (!preferred.error) return preferred
    if (!isMissingModuleReviewRpc(preferred.error.message)) return preferred

    return supabase.rpc('review_module_submission', {
      p_submission_id: submissionId,
      p_status: 'in_review',
      p_review_payload: reviewPayload,
    })
  }

  const { data: raw } = await supabase
    .from('module_submissions')
    .select('*')
    .eq('id', resolvedParams.id)
    .eq('module_key', 'fatigue_assessment')
    .single()

  if (!raw) notFound()
  if (!hasMedicScopeAccess(account, raw)) notFound()

  if (raw.status === 'awaiting_medic_review') {
    const reviewStartedAt = new Date().toISOString()
    const reviewPayload = {
      ...(typeof raw.review_payload === 'object' && raw.review_payload ? raw.review_payload : {}),
      reviewStartedAt,
      reviewedByUserId: user.id,
      reviewedByName: account.display_name,
    }
    const claimResult = await claimFatigueReview(String(raw.id), reviewPayload)
    if (!claimResult.error) {
      raw.status = 'in_medic_review'
      raw.reviewed_at = reviewStartedAt
      raw.reviewed_by = user.id
      raw.review_payload = reviewPayload
    }
  }

  const [{ data: site }, { data: business }] = await Promise.all([
    supabase.from('sites').select('name').eq('id', raw.site_id).single(),
    supabase.from('businesses').select('name').eq('id', raw.business_id).single(),
  ])
  const { data: rawComments } = await supabase
    .from('fatigue_assessment_comments')
    .select('id, medic_user_id, medic_name, note, outcome, created_at, edited_at')
    .eq('submission_id', raw.id)
    .order('created_at', { ascending: true })

  const queueContext = parseQueue(resolvedSearchParams)
  const backHref = `/medic/fatigue?site=${encodeURIComponent(resolvedSearchParams.site || String(raw.site_id || ''))}`

  return (
    <FatigueDetail
      assessment={{
        ...parseFatigueAssessment(raw),
        comments: parseSubmissionComments(rawComments ?? []),
      }}
      siteName={site?.name || String(raw.site_id)}
      businessName={business?.name || String(raw.business_id)}
      currentUserId={user.id}
      queueContext={queueContext}
      backHref={backHref}
    />
  )
}
