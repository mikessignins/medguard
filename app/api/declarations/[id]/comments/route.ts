import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { MedicComment } from '@/lib/types'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import { parseSubmissionComments } from '@/lib/submission-comments'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { submissionCommentRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { safeLogServerEvent } from '@/lib/app-event-log'

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
    .select('role, display_name, business_id, site_ids')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'medic') return null

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
    .select('id, business_id, site_id')
    .eq('id', submissionId)
    .single()

  return data
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
  { params }: { params: { id: string } }
) {
  const parsedId = parseUuidParam(params.id, 'Submission id')
  if (!parsedId.success) return parsedId.response

  const medic = await getAuthenticatedMedic()
  if (!medic) return new NextResponse('Unauthorized', { status: 401 })

  const submission = await fetchScopedSubmission(medic.client, parsedId.value)
  if (!submission) return new NextResponse('Submission not found', { status: 404 })
  if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })

  try {
    return NextResponse.json(await fetchComments(medic.client, parsedId.value))
  } catch (error) {
    console.error('[comments/GET] error:', error)
    return new NextResponse('Failed to load comments', { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const parsedId = parseUuidParam(params.id, 'Submission id')
  if (!parsedId.success) return parsedId.response

  const csrfError = requireSameOrigin(request)
  if (csrfError) return csrfError

  const medic = await getAuthenticatedMedic()
  if (!medic) return new NextResponse('Unauthorized', { status: 401 })

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

  const submission = await fetchScopedSubmission(medic.client, parsedId.value)
  if (!submission) return new NextResponse('Submission not found', { status: 404 })
  if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })

  const now = new Date().toISOString()
  const newComment = {
    submission_id: parsedId.value,
    business_id: submission.business_id,
    site_id: submission.site_id,
    medic_user_id: medic.id,
    medic_name: medic.name,
    note,
    outcome: outcome ?? null,
    created_at: now,
    edited_at: null,
  }

  const { data, error } = await medic.client
    .from('submission_comments')
    .insert(newComment)
    .select('id, medic_user_id, medic_name, note, outcome, created_at, edited_at')
    .single()

  if (error) {
    console.error('[comments/POST] error:', error)
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
    return new NextResponse(error.message, { status: 500 })
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
}
