import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { SubmissionStatus } from '@/lib/types'
import { requireAuthenticatedUser, requireMedicScope, requireRole } from '@/lib/route-access'
import {
  validateRequestedReviewStatus,
  validateReviewTransition,
} from '@/lib/review-guards'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
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

  let body: { status: SubmissionStatus; note?: string; version?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { status, note, version } = body

  const invalidStatus = validateRequestedReviewStatus(status)
  if (invalidStatus) {
    return NextResponse.json({ error: invalidStatus.error }, { status: invalidStatus.status })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch current row for optimistic lock check and transition validation
  const { data: current } = await supabase
    .from('submissions')
    .select('status, version, decision, business_id, site_id')
    .eq('id', params.id)
    .single()

  if (!current) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  const scopeError = requireMedicScope(medicAccount, current)
  if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })

  const transitionError = validateReviewTransition({
    currentStatus: current.status,
    requestedStatus: status,
    currentVersion: current.version,
    requestedVersion: version,
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

  const { error } = await supabase
    .from('submissions')
    .update({ status, decision })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
