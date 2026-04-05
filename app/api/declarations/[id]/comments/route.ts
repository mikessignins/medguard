import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { MedicComment } from '@/lib/types'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import { parseSubmissionComments } from '@/lib/submission-comments'

export const runtime = 'nodejs'

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
  }
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function fetchScopedSubmission(submissionId: string) {
  const { data } = await serviceClient()
    .from('submissions')
    .select('id, business_id, site_id')
    .eq('id', submissionId)
    .single()

  return data
}

async function fetchComments(submissionId: string): Promise<MedicComment[]> {
  const { data, error } = await serviceClient()
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
  const medic = await getAuthenticatedMedic()
  if (!medic) return new NextResponse('Unauthorized', { status: 401 })

  const submission = await fetchScopedSubmission(params.id)
  if (!submission) return new NextResponse('Submission not found', { status: 404 })
  if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })

  try {
    return NextResponse.json(await fetchComments(params.id))
  } catch (error) {
    console.error('[comments/GET] error:', error)
    return new NextResponse('Failed to load comments', { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const medic = await getAuthenticatedMedic()
  if (!medic) return new NextResponse('Unauthorized', { status: 401 })

  let body: { note: string; outcome?: string | null }
  try {
    body = await request.json()
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  const note = body.note?.trim()
  if (!note) return new NextResponse('note is required', { status: 400 })

  const submission = await fetchScopedSubmission(params.id)
  if (!submission) return new NextResponse('Submission not found', { status: 404 })
  if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })

  const now = new Date().toISOString()
  const newComment = {
    submission_id: params.id,
    business_id: submission.business_id,
    site_id: submission.site_id,
    medic_user_id: medic.id,
    medic_name: medic.name,
    note,
    outcome: body.outcome ?? null,
    created_at: now,
    edited_at: null,
  }

  const { data, error } = await serviceClient()
    .from('submission_comments')
    .insert(newComment)
    .select('id, medic_user_id, medic_name, note, outcome, created_at, edited_at')
    .single()

  if (error) {
    console.error('[comments/POST] error:', error)
    return new NextResponse(error.message, { status: 500 })
  }

  const comment = parseSubmissionComments(data ? [data] : [])[0]
  if (!comment) {
    return new NextResponse('Failed to parse saved comment', { status: 500 })
  }

  return NextResponse.json(comment, { status: 201 })
}
