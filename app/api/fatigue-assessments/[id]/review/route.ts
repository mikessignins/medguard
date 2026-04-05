import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { FatigueMedicReviewPayload, FatigueReviewDecision } from '@/lib/types'
import { requireAuthenticatedUser, requireMedicScope, requireRole } from '@/lib/route-access'

export const runtime = 'nodejs'

const REVIEW_DECISIONS: FatigueReviewDecision[] = [
  'fit_normal_duties',
  'fit_restricted_duties',
  'not_fit_for_work',
  'sent_to_room',
  'sent_home',
  'requires_escalation',
]

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

  const { data: { user } } = await authClient.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id, site_ids')
    .eq('id', userId)
    .single()

  const roleError = requireRole(account, 'medic')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })
  const medicAccount = account!

  let body: FatigueMedicReviewPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.fitForWorkDecision || !REVIEW_DECISIONS.includes(body.fitForWorkDecision)) {
    return NextResponse.json({ error: 'A valid fatigue review outcome is required.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: current } = await supabase
    .from('module_submissions')
    .select('id, business_id, site_id, status, review_payload, reviewed_by')
    .eq('id', params.id)
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

  const { error } = await supabase
    .from('module_submissions')
    .update({
      status: 'resolved',
      review_payload: reviewPayload,
      reviewed_at: now,
      reviewed_by: userId,
    })
    .eq('id', params.id)
    .eq('module_key', 'fatigue_assessment')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
