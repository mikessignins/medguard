import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { MedicComment } from '@/lib/types'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import { parseSubmissionComments } from '@/lib/submission-comments'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { submissionCommentRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type AuthenticatedMedic = {
  id: string
  name: string
  business_id: string | null
  site_ids: string[]
  client: ReturnType<typeof createServerClient>
}

async function getAuthenticatedMedic() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id, site_ids, is_inactive, contract_end_date')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'medic' || account.is_inactive) return null

  return {
    id: user.id,
    name: account.display_name as string,
    business_id: account.business_id ?? null,
    site_ids: account.site_ids ?? [],
    client: authClient,
  } satisfies AuthenticatedMedic
}

async function fetchScopedFatigue(authClient: AuthenticatedMedic['client'], submissionId: string) {
  const { data } = await authClient
    .from('module_submissions')
    .select('id, business_id, site_id, module_key, status, exported_at, phi_purged_at')
    .eq('id', submissionId)
    .eq('module_key', 'fatigue_assessment')
    .single()

  return data
}

function getCommentLockMessage(submission: Awaited<ReturnType<typeof fetchScopedFatigue>>) {
  if (!submission) return null
  if (submission.phi_purged_at) return 'Medical information has been archived; new comments cannot be added.'
  if (submission.status === 'resolved') return 'The PDF is locked to new comments once the fatigue outcome is finalised.'
  if (submission.exported_at) return 'The PDF is locked to new comments after export.'
  return null
}

async function fetchComments(authClient: AuthenticatedMedic['client'], submissionId: string): Promise<MedicComment[]> {
  const { data, error } = await authClient
    .from('fatigue_assessment_comments')
    .select('id, medic_user_id, medic_name, note, outcome, created_at, edited_at')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return parseSubmissionComments(data ?? [])
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const parsedId = parseUuidParam(resolvedParams.id, 'Fatigue assessment id')
    if (!parsedId.success) return parsedId.response

    const medic = await getAuthenticatedMedic()
    if (!medic) return new NextResponse('Unauthorized', { status: 401 })

    const submission = await fetchScopedFatigue(medic.client, parsedId.value)
    if (!submission) return new NextResponse('Fatigue assessment not found', { status: 404 })
    if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })

    return NextResponse.json(await fetchComments(medic.client, parsedId.value))
  } catch (error) {
    return logAndReturnInternalError('/api/fatigue-assessments/[id]/comments', error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const parsedId = parseUuidParam(resolvedParams.id, 'Fatigue assessment id')
    if (!parsedId.success) return parsedId.response

    const csrfError = requireSameOrigin(request)
    if (csrfError) return csrfError

    const medic = await getAuthenticatedMedic()
    if (!medic) return new NextResponse('Unauthorized', { status: 401 })

    const submission = await fetchScopedFatigue(medic.client, parsedId.value)
    if (!submission) return new NextResponse('Fatigue assessment not found', { status: 404 })
    if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })
    const commentLockMessage = getCommentLockMessage(submission)
    if (commentLockMessage) return NextResponse.json({ error: commentLockMessage }, { status: 409 })

    const rateLimited = await enforceActionRateLimit({
      authClient: medic.client,
      action: 'fatigue_comment_saved',
      actorUserId: medic.id,
      actorName: medic.name,
      businessId: medic.business_id,
      moduleKey: 'fatigue_assessment',
      route: '/api/fatigue-assessments/[id]/comments',
      targetId: parsedId.value,
      limit: 12,
      windowMs: 60_000,
      errorMessage: 'Too many comments were submitted. Please wait a minute and try again.',
    })
    if (rateLimited) return rateLimited

    const parsed = await parseJsonBody(request, submissionCommentRequestSchema)
    if (!parsed.success) return parsed.response
    const { note, outcome } = parsed.data

    let data: unknown = null
    let error: { message: string } | null = null

    try {
      const service = createServiceClient()
      const { data: serviceData, error: serviceError } = await service
        .rpc('add_fatigue_assessment_comment_authorized', {
          p_actor_user_id: medic.id,
          p_submission_id: parsedId.value,
          p_note: note,
          p_outcome: outcome ?? null,
        })
        .single()

      if (serviceError) {
        const fallback = await medic.client
          .rpc('add_fatigue_assessment_comment', {
            p_submission_id: parsedId.value,
            p_note: note,
            p_outcome: outcome ?? null,
          })
          .select('id, medic_user_id, medic_name, note, outcome, created_at, edited_at')
          .single()

        data = fallback.data
        error = fallback.error
      } else {
        data = serviceData
      }
    } catch {
      const fallback = await medic.client
        .rpc('add_fatigue_assessment_comment', {
          p_submission_id: parsedId.value,
          p_note: note,
          p_outcome: outcome ?? null,
        })
        .select('id, medic_user_id, medic_name, note, outcome, created_at, edited_at')
        .single()

      data = fallback.data
      error = fallback.error
    }

    if (error) {
      await safeLogServerEvent({
        source: 'web_api',
        action: 'fatigue_comment_saved',
        result: 'failure',
        actorUserId: medic.id,
        actorName: medic.name,
        businessId: medic.business_id,
        moduleKey: 'fatigue_assessment',
        route: '/api/fatigue-assessments/[id]/comments',
        targetId: parsedId.value,
        errorMessage: error.message,
      })
      return logAndReturnInternalError('/api/fatigue-assessments/[id]/comments', error)
    }

    const comment = parseSubmissionComments(data ? [data] : [])[0]
    if (!comment) return new NextResponse('Failed to parse saved comment', { status: 500 })

    await safeLogServerEvent({
      source: 'web_api',
      action: 'fatigue_comment_saved',
      result: 'success',
      actorUserId: medic.id,
      actorName: medic.name,
      businessId: medic.business_id,
      moduleKey: 'fatigue_assessment',
      route: '/api/fatigue-assessments/[id]/comments',
      targetId: parsedId.value,
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return logAndReturnInternalError('/api/fatigue-assessments/[id]/comments', error)
  }
}
