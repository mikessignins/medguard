import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { MedDecReviewStatus } from '@/lib/types'
import { requireAuthenticatedUser, requireMedicScope, requireRole } from '@/lib/route-access'
import { validateMedicationReviewTransition } from '@/lib/medication-review-guards'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { medicationReviewRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'

const VALID_STATUSES: MedDecReviewStatus[] = ['Pending', 'In Review', 'Normal Duties', 'Restricted Duties', 'Unfit for Work']

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const parsedId = parseUuidParam(params.id, 'Medication declaration id')
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
    .from('user_accounts').select('role, display_name, business_id, site_ids').eq('id', userId).single()
  const roleError = requireRole(account, 'medic')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })
  const medicAccount = account!

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'medication_review_saved',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'confidential_medication',
    route: '/api/medication-declarations/[id]/review',
    targetId: parsedId.value,
    limit: 20,
    windowMs: 5 * 60_000,
    errorMessage: 'Too many medication review updates were submitted. Please wait a moment and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, medicationReviewRequestSchema)
  if (!parsed.success) return parsed.response

  const { medic_review_status, medic_comments, review_required } = parsed.data

  if (!VALID_STATUSES.includes(medic_review_status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Fetch current status to enforce forward-only transitions
  const { data: current } = await authClient
    .from('medication_declarations')
    .select('medic_review_status, business_id, site_id')
    .eq('id', parsedId.value)
    .single()

  if (!current) return NextResponse.json({ error: 'Declaration not found' }, { status: 404 })
  const scopeError = requireMedicScope(medicAccount, current)
  if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })

  const transitionError = validateMedicationReviewTransition(current.medic_review_status)
  if (transitionError) {
    return NextResponse.json(
      { error: transitionError.error },
      { status: transitionError.status }
    )
  }

  const { data: updatedDeclaration, error } = await authClient
    .from('medication_declarations')
    .update({
      medic_review_status,
      medic_comments: medic_comments ?? '',
      review_required,
      medic_name: medicAccount.display_name,
      medic_reviewed_at: new Date().toISOString(),
    })
    .eq('id', parsedId.value)
    .eq('medic_review_status', current.medic_review_status)
    .select('id')
    .maybeSingle()

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'medication_review_saved',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'confidential_medication',
      route: '/api/medication-declarations/[id]/review',
      targetId: parsedId.value,
      errorMessage: error.message,
      context: { medic_review_status },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!updatedDeclaration) {
    return NextResponse.json(
      { error: 'This medication review was updated by another medic. Please refresh and try again.' },
      { status: 409 }
    )
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'medication_review_saved',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'confidential_medication',
    route: '/api/medication-declarations/[id]/review',
    targetId: parsedId.value,
    context: { medic_review_status },
  })

  return NextResponse.json({ ok: true })
}
