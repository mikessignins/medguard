import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireActiveMedic, requireAuthenticatedUser, requireMedicScope } from '@/lib/route-access'
import {
  validateRequestedReviewStatus,
  validateReviewTransition,
} from '@/lib/review-guards'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { emergencyReviewRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { enqueueDeclarationProcessing } from '@/lib/declaration-processing'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params
  const parsedId = parseUuidParam(resolvedParams.id, 'Declaration id')
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
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await authClient
    .from('user_accounts').select('role, display_name, business_id, site_ids, is_inactive, contract_end_date').eq('id', userId).single()
  const roleError = requireActiveMedic(account)
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })
  const medicAccount = account!

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'emergency_review_saved',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'emergency_declaration',
    route: '/api/declarations/[id]/review',
    targetId: parsedId.value,
    limit: 20,
    windowMs: 5 * 60_000,
    errorMessage: 'Too many emergency review updates were submitted. Please wait a moment and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, emergencyReviewRequestSchema)
  if (!parsed.success) return parsed.response

  const { status, note, version } = parsed.data

  const invalidStatus = validateRequestedReviewStatus(status)
  if (invalidStatus) {
    return NextResponse.json({ error: invalidStatus.error }, { status: invalidStatus.status })
  }

  // Fetch current row for optimistic lock check and transition validation
  const { data: current } = await authClient
    .from('submissions')
    .select('status, version, decision, business_id, site_id')
    .eq('id', parsedId.value)
    .single()

  if (!current) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  const scopeError = requireMedicScope(medicAccount, current)
  if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })

  const transitionError = validateReviewTransition({
    currentStatus: current.status,
    requestedStatus: status,
    currentVersion: current.version,
    requestedVersion: version ?? undefined,
  })
  if (transitionError) {
    return NextResponse.json(
      {
        error: transitionError.error,
        ...(transitionError.current_version !== undefined
          ? { current_version: transitionError.current_version }
          : {}),
      },
      { status: transitionError.status }
    )
  }

  // Build or preserve decision object
  const decidedAt = new Date().toISOString()
  const decision =
    status === 'Approved' || status === 'Requires Follow-up'
      ? {
          outcome:           status,
          note:              note?.trim() ?? null,
          decided_by_user_id: userId,
          decided_by_name:   medicAccount.display_name as string,
          decided_at:        decidedAt,
        }
      : (current.decision ?? null)

  const { data: updatedSubmission, error } = await authClient
    .from('submissions')
    .update({ status, decision })
    .eq('id', parsedId.value)
    .eq('version', current.version)
    .select('id')
    .maybeSingle()

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'emergency_review_saved',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'emergency_declaration',
      route: '/api/declarations/[id]/review',
      targetId: parsedId.value,
      errorMessage: error.message,
      context: { status },
    })
    return logAndReturnInternalError('/api/declarations/[id]/review', error)
  }

  if (!updatedSubmission) {
    return NextResponse.json(
      {
        error: 'This form was updated by another user. Please refresh and try again.',
        current_version: current.version,
      },
      { status: 409 }
    )
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'emergency_review_saved',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'emergency_declaration',
    route: '/api/declarations/[id]/review',
    targetId: parsedId.value,
    context: { status },
  })

  void enqueueDeclarationProcessing({
    moduleKey: 'emergency_declaration',
    route: '/api/declarations/[id]/review',
    targetId: parsedId.value,
    targetTable: 'submissions',
    businessId: medicAccount.business_id,
    siteId: current.site_id,
    triggeredByUserId: userId!,
  })

  return NextResponse.json({ ok: true })
}
