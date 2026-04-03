import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import type { PsychosocialReviewEntry, PsychosocialReviewPayload } from '@/lib/types'

export const runtime = 'nodejs'

const NEXT_STATUSES = ['awaiting_follow_up', 'resolved'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id, site_ids')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'medic') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: PsychosocialReviewPayload
  let nextStatus: typeof NEXT_STATUSES[number] = 'resolved'
  try {
    const parsed = await request.json()
    body = parsed as PsychosocialReviewPayload
    if (typeof parsed.nextStatus === 'string' && NEXT_STATUSES.includes(parsed.nextStatus)) {
      nextStatus = parsed.nextStatus
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.outcomeSummary?.trim()) {
    return NextResponse.json({ error: 'An outcome summary is required.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: current } = await supabase
    .from('module_submissions')
    .select('id, business_id, site_id, status, payload, review_payload, reviewed_by')
    .eq('id', params.id)
    .eq('module_key', 'psychosocial_health')
    .single()

  if (!current) return NextResponse.json({ error: 'Psychosocial support check-in not found.' }, { status: 404 })
  if (!hasMedicScopeAccess(account, current)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
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

  if (current.status === 'in_medic_review' && lockedReviewerId && lockedReviewerId !== user.id) {
    return NextResponse.json(
      { error: 'Another reviewer has already claimed this psychosocial support check-in.' },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const newReviewComment = typeof body.reviewComments === 'string' ? body.reviewComments.trim() : ''
  const existingEntries = Array.isArray(existingReviewPayload?.reviewEntries)
    ? (existingReviewPayload.reviewEntries as PsychosocialReviewEntry[])
    : []
  const nextEntries = newReviewComment
    ? [
        ...existingEntries,
        {
          id: crypto.randomUUID(),
          createdAt: now,
          createdByUserId: user.id,
          createdByName: account.display_name,
          actionLabel:
            typeof body.supportActions === 'string' && body.supportActions.trim()
              ? body.supportActions.trim()
              : null,
          note: newReviewComment,
        },
      ]
    : existingEntries

  const reviewPayload = {
    ...(existingReviewPayload ?? {}),
    ...body,
    reviewStartedAt: existingReviewPayload?.reviewStartedAt ?? now,
    reviewedByUserId: user.id,
    reviewedByName: account.display_name,
    caseOwnerUserId: (body.caseOwnerUserId ?? existingReviewPayload?.caseOwnerUserId ?? user.id) as string,
    caseOwnerName: (body.caseOwnerName ?? existingReviewPayload?.caseOwnerName ?? account.display_name) as string,
    followUpRequired:
      nextStatus === 'awaiting_follow_up'
        ? true
        : body.followUpRequired ?? existingReviewPayload?.followUpRequired ?? false,
    reviewEntries: nextEntries,
    reviewComments: newReviewComment || existingReviewPayload?.reviewComments || null,
  }

  const { error } = await supabase
    .from('module_submissions')
    .update({
      status: nextStatus,
      review_payload: reviewPayload,
      reviewed_at: now,
      reviewed_by: user.id,
    })
    .eq('id', params.id)
    .eq('module_key', 'psychosocial_health')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
