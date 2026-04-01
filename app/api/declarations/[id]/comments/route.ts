import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import type { MedicComment } from '@/lib/types'
import { hasMedicScopeAccess } from '@/lib/medic-scope'

export const runtime = 'nodejs'

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthenticatedMedic() {
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

async function fetchComments(submissionId: string): Promise<MedicComment[]> {
  const { data } = await serviceClient()
    .from('submissions')
    .select('comments')
    .eq('id', submissionId)
    .single()
  const raw = data?.comments
  return Array.isArray(raw) ? (raw as MedicComment[]) : []
}

async function fetchScopedSubmission(submissionId: string) {
  const { data } = await serviceClient()
    .from('submissions')
    .select('id, business_id, site_id, comments')
    .eq('id', submissionId)
    .single()

  return data
}

async function writeComments(submissionId: string, comments: MedicComment[]) {
  const { error } = await serviceClient()
    .from('submissions')
    .update({ comments })
    .eq('id', submissionId)
  return error
}

// ─── POST — add a new comment ─────────────────────────────────────────────────

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

  const newComment: MedicComment = {
    id: randomUUID(),
    medic_user_id: medic.id,
    medic_name: medic.name,
    note,
    outcome: body.outcome ?? null,
    created_at: new Date().toISOString(),
    edited_at: null,
  }

  const current = Array.isArray(submission.comments) ? (submission.comments as MedicComment[]) : await fetchComments(params.id)
  const error = await writeComments(params.id, [...current, newComment])
  if (error) {
    console.error('[comments/POST] error:', error)
    return new NextResponse(error.message, { status: 500 })
  }

  return NextResponse.json(newComment, { status: 201 })
}

// ─── PATCH — edit own comment ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const medic = await getAuthenticatedMedic()
  if (!medic) return new NextResponse('Unauthorized', { status: 401 })

  let body: { commentId: string; note: string }
  try {
    body = await request.json()
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  const note = body.note?.trim()
  if (!note || !body.commentId) return new NextResponse('commentId and note required', { status: 400 })

  const submission = await fetchScopedSubmission(params.id)
  if (!submission) return new NextResponse('Submission not found', { status: 404 })
  if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })

  const current = Array.isArray(submission.comments) ? (submission.comments as MedicComment[]) : await fetchComments(params.id)
  const idx = current.findIndex(c => c.id === body.commentId)
  if (idx === -1) return new NextResponse('Comment not found', { status: 404 })
  if (current[idx].medic_user_id !== medic.id) return new NextResponse('Forbidden', { status: 403 })

  const updated = { ...current[idx], note, edited_at: new Date().toISOString() }
  current[idx] = updated

  const error = await writeComments(params.id, current)
  if (error) {
    console.error('[comments/PATCH] error:', error)
    return new NextResponse(error.message, { status: 500 })
  }

  return NextResponse.json(updated)
}

// ─── DELETE — delete own comment ──────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const medic = await getAuthenticatedMedic()
  if (!medic) return new NextResponse('Unauthorized', { status: 401 })

  let body: { commentId: string }
  try {
    body = await request.json()
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  if (!body.commentId) return new NextResponse('commentId required', { status: 400 })

  const submission = await fetchScopedSubmission(params.id)
  if (!submission) return new NextResponse('Submission not found', { status: 404 })
  if (!hasMedicScopeAccess(medic, submission)) return new NextResponse('Forbidden', { status: 403 })

  const current = Array.isArray(submission.comments) ? (submission.comments as MedicComment[]) : await fetchComments(params.id)
  const comment = current.find(c => c.id === body.commentId)
  if (!comment) return new NextResponse('Comment not found', { status: 404 })
  if (comment.medic_user_id !== medic.id) return new NextResponse('Forbidden', { status: 403 })

  const error = await writeComments(params.id, current.filter(c => c.id !== body.commentId))
  if (error) {
    console.error('[comments/DELETE] error:', error)
    return new NextResponse(error.message, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
