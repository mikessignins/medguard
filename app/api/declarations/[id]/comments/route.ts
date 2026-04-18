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

const APPROVED_COMMENT_LOCK_MESSAGE = 'The PDF is locked to new comments now that it is approved.'
const EXPORTED_COMMENT_LOCK_MESSAGE = 'The PDF is locked to new comments after export.'

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
          } catch {
            // No-op in server components.
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await authClient.auth.getUser()
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

async function fetchScopedSubmission(authClient: AuthenticatedMedic['client'], submissionId: string) {
  const { data } = await authClient
    .from('submissions')
    .select('id, business_id, site_id, status, exported_at')
    .eq('id', submissionId)
    .single()

  return data
}

function getCommentLockMessage(submission: Awaited<ReturnType<typeof fetchScopedSubmission>>) {
  if (!submission) return null
  if (submission.status === 'Approved') return APPROVED_COMMENT_LOCK_MESSAGE
  if (submission.exported_at) return EXPORTED_COMMENT_LOCK_MESSAGE
  return null
}

async function fetchComments(authClient: AuthenticatedMedic['client'], submissionId: string): Promise<MedicComment[]> {
  const { data, error } = await authClient
    .from('submission_comments')
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
    const parsedId = parseUuidParam(resolvedParams.id, 'Submission id')
    if (!parsedId.success) return parsedId.response

    const medic = await getAuthenticatedMedic()
    if (!medic) return new NextResponse('Unauthorized', { status: 401 })

    const submission = await fetchScopedSubmission(medic.client, parsedId.value)
    if (!submission) return new NextResponse('Submission not found', { status: 404 })
    if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })

    return NextResponse.json(await fetchComments(medic.client, parsedId.value))
  } catch (error) {
    return logAndReturnInternalError('/api/declarations/[id]/comments', error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const parsedId = parseUuidParam(resolvedParams.id, 'Submission id')
    if (!parsedId.success) return parsedId.response

    const csrfError = requireSameOrigin(request)
    if (csrfError) return csrfError

    const medic = await getAuthenticatedMedic()
    if (!medic) return new NextResponse('Unauthorized', { status: 401 })

    const submission = await fetchScopedSubmission(medic.client, parsedId.value)
    if (!submission) return new NextResponse('Submission not found', { status: 404 })
    if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })
    const commentLockMessage = getCommentLockMessage(submission)
    if (commentLockMessage) {
      return NextResponse.json({ error: commentLockMessage }, { status: 409 })
    }

    const rateLimited = await enforceActionRateLimit({
      authClient: medic.client,
      action: 'emergency_comment_saved',
      actorUserId: medic.id,
      actorName: medic.name,
      businessId: medic.business_id,
      moduleKey: 'emergency_declaration',
      route: '/api/declarations/[id]/comments',
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
        .rpc('add_submission_comment_authorized', {
          p_actor_user_id: medic.id,
          p_submission_id: parsedId.value,
          p_note: note,
          p_outcome: outcome ?? null,
        })
        .single()

      if (serviceError) {
        console.warn('[comments/POST] authorized RPC failed; falling back to authenticated RPC', {
          submissionId: parsedId.value,
          actorUserId: medic.id,
          message: serviceError.message,
        })

        const fallback = await medic.client
          .rpc('add_submission_comment', {
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
    } catch (serviceError) {
      console.warn('[comments/POST] authorized RPC path threw; falling back to authenticated RPC', {
        submissionId: parsedId.value,
        actorUserId: medic.id,
        message: serviceError instanceof Error ? serviceError.message : String(serviceError),
      })

      const fallback = await medic.client
        .rpc('add_submission_comment', {
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
        action: 'emergency_comment_saved',
        result: 'failure',
        actorUserId: medic.id,
        actorName: medic.name,
        businessId: medic.business_id,
        moduleKey: 'emergency_declaration',
        route: '/api/declarations/[id]/comments',
        targetId: parsedId.value,
        errorMessage: error.message,
      })
      return logAndReturnInternalError('/api/declarations/[id]/comments', error)
    }

    const comment = parseSubmissionComments(data ? [data] : [])[0]
    if (!comment) {
      return new NextResponse('Failed to parse saved comment', { status: 500 })
    }

    await safeLogServerEvent({
      source: 'web_api',
      action: 'emergency_comment_saved',
      result: 'success',
      actorUserId: medic.id,
      actorName: medic.name,
      businessId: medic.business_id,
      moduleKey: 'emergency_declaration',
      route: '/api/declarations/[id]/comments',
      targetId: parsedId.value,
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return logAndReturnInternalError('/api/declarations/[id]/comments', error)
  }
}
