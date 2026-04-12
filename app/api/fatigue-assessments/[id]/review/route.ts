import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { FatigueMedicReviewPayload } from '@/lib/types'
import { requireActiveMedic, requireAuthenticatedUser, requireMedicScope } from '@/lib/route-access'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { fatigueReviewRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { enqueueDeclarationProcessing } from '@/lib/declaration-processing'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params
  const parsedId = parseUuidParam(resolvedParams.id, 'Fatigue assessment id')
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

  const { data: { user } } = await authClient.auth.getUser()
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
    action: 'fatigue_review_saved',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'fatigue_assessment',
    route: '/api/fatigue-assessments/[id]/review',
    targetId: parsedId.value,
    limit: 20,
    windowMs: 5 * 60_000,
    errorMessage: 'Too many fatigue review updates were submitted. Please wait a moment and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, fatigueReviewRequestSchema)
  if (!parsed.success) return parsed.response
  const body: FatigueMedicReviewPayload = parsed.data

  const { data: current } = await authClient
    .from('module_submissions')
    .select('id, business_id, site_id, status, review_payload, reviewed_by')
    .eq('id', parsedId.value)
    .eq('module_key', 'fatigue_assessment')
    .single()

  if (!current) return NextResponse.json({ error: 'Fatigue assessment not found.' }, { status: 404 })
  const scopeError = requireMedicScope(medicAccount, current)
  if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })

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
      { error: 'This fatigue review has already been finalised and can no longer be changed.' },
      { status: 409 },
    )
  }

  if (current.status === 'in_medic_review' && lockedReviewerId && lockedReviewerId !== userId) {
    return NextResponse.json(
      { error: 'Another medic has already claimed this fatigue review.' },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const reviewPayload = {
    ...(existingReviewPayload ?? {}),
    ...body,
    reviewStartedAt: existingReviewPayload?.reviewStartedAt ?? now,
    reviewedByUserId: userId,
    reviewedByName: medicAccount.display_name,
  }

  const { error } = await authClient.rpc('review_module_submission', {
    p_submission_id: parsedId.value,
    p_module_key: 'fatigue_assessment',
    p_next_status: 'resolved',
    p_review_payload: reviewPayload,
    p_expected_status: current.status,
    p_expected_reviewed_by: current.reviewed_by ? String(current.reviewed_by) : null,
  })

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'fatigue_review_saved',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'fatigue_assessment',
      route: '/api/fatigue-assessments/[id]/review',
      targetId: parsedId.value,
      errorMessage: error.message,
      context: { fit_for_work_decision: body.fitForWorkDecision },
    })
    return logAndReturnInternalError('/api/fatigue-assessments/[id]/review', error)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'fatigue_review_saved',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'fatigue_assessment',
    route: '/api/fatigue-assessments/[id]/review',
    targetId: parsedId.value,
    context: { fit_for_work_decision: body.fitForWorkDecision },
  })

  void enqueueDeclarationProcessing({
    moduleKey: 'fatigue_assessment',
    route: '/api/fatigue-assessments/[id]/review',
    targetId: parsedId.value,
    targetTable: 'module_submissions',
    businessId: medicAccount.business_id,
    siteId: current.site_id,
    triggeredByUserId: userId!,
  })

  return NextResponse.json({ ok: true })
}
