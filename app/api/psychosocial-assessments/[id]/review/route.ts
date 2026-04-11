import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireActiveMedic, requireAuthenticatedUser, requireMedicScope } from '@/lib/route-access'
import type { PsychosocialReviewEntry } from '@/lib/types'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { psychosocialReviewRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { enqueueDeclarationProcessing } from '@/lib/declaration-processing'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params
  const parsedId = parseUuidParam(resolvedParams.id, 'Psychosocial assessment id')
  if (!parsedId.success) return parsedId.response

  const csrfError = requireSameOrigin(request)
  if (csrfError) return csrfError

  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    },
  )

  const {
    data: { user },
  } = await authClient.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id, site_ids, is_inactive, contract_end_date')
    .eq('id', userId)
    .single()

  const roleError = requireActiveMedic(account)
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })
  const medicAccount = account!

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'psychosocial_review_saved',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/[id]/review',
    targetId: parsedId.value,
    limit: 20,
    windowMs: 5 * 60_000,
    errorMessage: 'Too many psychosocial review updates were submitted. Please wait a moment and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, psychosocialReviewRequestSchema)
  if (!parsed.success) return parsed.response

  const { nextStatus, ...body } = parsed.data

  const { data: current } = await authClient
    .from('module_submissions')
    .select('id, business_id, site_id, status, payload, review_payload, reviewed_by')
    .eq('id', parsedId.value)
    .eq('module_key', 'psychosocial_health')
    .single()

  if (!current) return NextResponse.json({ error: 'Psychosocial support check-in not found.' }, { status: 404 })
  const scopeError = requireMedicScope(medicAccount, current)
  if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
  const workflowKind = current.payload?.workerPulse?.workflowKind
    ?? (current.payload?.postIncidentWelfare ? 'post_incident_psychological_welfare' : null)

  if (!workflowKind || !['support_check_in', 'post_incident_psychological_welfare'].includes(workflowKind)) {
    return NextResponse.json({ error: 'This psychosocial workflow is not reviewable.' }, { status: 422 })
  }

  const existingReviewPayload =
    typeof current.review_payload === 'object' && current.review_payload
      ? (current.review_payload as Record<string, unknown>)
      : null
  const lockedReviewerId =
    typeof existingReviewPayload?.reviewedByUserId === 'string'
      ? String(existingReviewPayload.reviewedByUserId)
      : (current.reviewed_by ? String(current.reviewed_by) : null)

  if (current.status === 'resolved') {
    return NextResponse.json(
      { error: 'This psychosocial review has already been finalised and can no longer be changed.' },
      { status: 409 },
    )
  }

  if (current.status === 'in_medic_review' && lockedReviewerId && lockedReviewerId !== userId) {
    return NextResponse.json(
      { error: 'Another reviewer has already claimed this psychosocial support check-in.' },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const newReviewComment = typeof body.reviewComments === 'string' ? body.reviewComments : ''
  const existingEntries = Array.isArray(existingReviewPayload?.reviewEntries)
    ? (existingReviewPayload.reviewEntries as PsychosocialReviewEntry[])
    : []
  const nextEntries = newReviewComment
    ? [
        ...existingEntries,
        {
          id: crypto.randomUUID(),
          createdAt: now,
          createdByUserId: userId,
          createdByName: medicAccount.display_name,
          actionLabel:
            typeof body.supportActions === 'string' && body.supportActions
              ? body.supportActions
              : null,
          note: newReviewComment,
        },
      ]
    : existingEntries

  const reviewPayload = {
    ...(existingReviewPayload ?? {}),
    ...body,
    reviewStartedAt: existingReviewPayload?.reviewStartedAt ?? now,
    reviewedByUserId: userId,
    reviewedByName: medicAccount.display_name,
    caseOwnerUserId: (body.caseOwnerUserId ?? existingReviewPayload?.caseOwnerUserId ?? userId) as string,
    caseOwnerName: (body.caseOwnerName ?? existingReviewPayload?.caseOwnerName ?? medicAccount.display_name) as string,
    followUpRequired:
      nextStatus === 'awaiting_follow_up'
        ? true
        : body.followUpRequired ?? existingReviewPayload?.followUpRequired ?? false,
    reviewEntries: nextEntries,
    reviewComments: newReviewComment || existingReviewPayload?.reviewComments || null,
  }

  let updateQuery = authClient
    .from('module_submissions')
    .update({
      status: nextStatus,
      review_payload: reviewPayload,
      reviewed_at: now,
      reviewed_by: userId,
    })
    .eq('id', parsedId.value)
    .eq('module_key', 'psychosocial_health')
    .eq('status', current.status)

  updateQuery = current.reviewed_by
    ? updateQuery.eq('reviewed_by', current.reviewed_by)
    : updateQuery.is('reviewed_by', null)

  const { data: updatedAssessment, error } = await updateQuery
    .select('id')
    .maybeSingle()

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'psychosocial_review_saved',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'psychosocial_health',
      route: '/api/psychosocial-assessments/[id]/review',
      targetId: parsedId.value,
      errorMessage: error.message,
      context: { next_status: nextStatus, workflow_kind: workflowKind },
    })
    return logAndReturnInternalError('/api/psychosocial-assessments/[id]/review', error)
  }

  if (!updatedAssessment) {
    return NextResponse.json(
      { error: 'This psychosocial review was updated by another medic. Please refresh and try again.' },
      { status: 409 },
    )
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'psychosocial_review_saved',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/[id]/review',
    targetId: parsedId.value,
    context: { next_status: nextStatus, workflow_kind: workflowKind },
  })

  void enqueueDeclarationProcessing({
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/[id]/review',
    targetId: parsedId.value,
    targetTable: 'module_submissions',
    businessId: medicAccount.business_id,
    siteId: current.site_id,
    triggeredByUserId: userId!,
  })

  return NextResponse.json({ ok: true })
}
