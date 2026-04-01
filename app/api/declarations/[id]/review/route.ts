import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { SubmissionStatus } from '@/lib/types'
import { hasMedicScopeAccess } from '@/lib/medic-scope'

export const runtime = 'nodejs'

// Statuses a medic can set via the web review UI.
// 'New' and 'Recalled' are set by the iOS app only.
const REVIEWABLE_STATUSES: SubmissionStatus[] = ['In Review', 'Approved', 'Requires Follow-up']

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await authClient
    .from('user_accounts').select('role, display_name, business_id, site_ids').eq('id', user.id).single()
  if (!account || account.role !== 'medic') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { status: SubmissionStatus; note?: string; version?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { status, note, version } = body

  if (!REVIEWABLE_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status '${status}'.` }, { status: 400 })
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
  if (!hasMedicScopeAccess(account, current)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Optimistic lock: if caller sent a version, it must match
  if (version !== undefined && current.version !== version) {
    return NextResponse.json(
      {
        error: 'This form was updated by another user. Please refresh and try again.',
        current_version: current.version,
      },
      { status: 409 }
    )
  }

  // Client-side transition guard (DB trigger enforces this too, but return a
  // clear message before hitting the DB so the UI can surface it properly)
  if (current.status === 'Approved' || current.status === 'Recalled') {
    return NextResponse.json(
      { error: `Cannot change status from terminal state '${current.status}'.` },
      { status: 422 }
    )
  }
  if (current.status === 'Requires Follow-up' && status !== 'Approved') {
    return NextResponse.json(
      { error: "From 'Requires Follow-up', status can only advance to 'Approved'." },
      { status: 422 }
    )
  }

  // Build or preserve decision object
  const decidedAt = new Date().toISOString()
  const decision =
    status === 'Approved' || status === 'Requires Follow-up'
      ? {
          outcome:           status,
          note:              note?.trim() ?? null,
          decided_by_user_id: user.id,
          decided_by_name:   account.display_name as string,
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
