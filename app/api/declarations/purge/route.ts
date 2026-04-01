import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { hasMedicScopeAccess } from '@/lib/medic-scope'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // 1. Auth — must be a signed-in medic
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
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: account } = await authClient
    .from('user_accounts').select('role, display_name, business_id, site_ids').eq('id', user.id).single()
  if (!account || account.role !== 'medic') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // 2. Parse body
  let ids: string[]
  try {
    const body = await request.json()
    ids = Array.isArray(body.ids) ? body.ids : []
  } catch {
    return new NextResponse('Invalid request body', { status: 400 })
  }

  if (ids.length === 0) {
    return NextResponse.json({ purged: 0 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 3. Fetch submission data before wiping — guard: all must be exported first
  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, business_id, site_id, site_name, worker_snapshot, exported_at, exported_by_name, decision')
    .in('id', ids)

  if ((submissions ?? []).length !== ids.length) {
    return NextResponse.json({ error: 'One or more declarations were not found.' }, { status: 404 })
  }

  const outOfScope = (submissions ?? []).some((submission) => !hasMedicScopeAccess(account, submission))
  if (outOfScope) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const unexported = (submissions ?? []).filter(s => !s.exported_at)
  if (unexported.length > 0) {
    return NextResponse.json(
      { error: 'All declarations must be exported to PDF before purging.' },
      { status: 400 }
    )
  }

  // 4. Build audit log entries (site_name already snapshotted on row since migration 002)
  const purgedAt = new Date().toISOString()
  const auditRows = (submissions ?? []).map(sub => {
    const ws       = sub.worker_snapshot as Record<string, unknown> | null
    const decision = sub.decision as Record<string, unknown> | null
    return {
      submission_id:    sub.id,
      worker_name:      (ws?.fullName as string) ?? null,
      worker_dob:       (ws?.dateOfBirth as string) ?? null,
      site_id:          sub.site_id ?? null,
      site_name:        sub.site_name ?? null,
      business_id:      sub.business_id,
      medic_user_id:    user.id,
      medic_name:       account.display_name as string,
      purged_at:        purgedAt,
      form_type:        'emergency_declaration',
      exported_at:      sub.exported_at ?? null,
      exported_by_name: sub.exported_by_name ?? null,
      approved_by_name: (decision?.decided_by_name as string) ?? null,
      approved_at:      (decision?.decided_at as string) ?? null,
    }
  })

  // 6. Write audit log
  if (auditRows.length > 0) {
    const { error: auditError } = await supabase.from('purge_audit_log').insert(auditRows)
    if (auditError) console.error('[purge/route] audit log error:', auditError)
  }

  // 7. Wipe PHI
  const { error } = await supabase
    .from('submissions')
    .update({
      phi_purged_at: purgedAt,
      worker_snapshot: null,
      script_uploads: null,
    })
    .in('id', ids)

  if (error) {
    console.error('[purge/route] update error:', error)
    return new NextResponse(`Purge failed: ${error.message}`, { status: 500 })
  }

  return NextResponse.json({ purged: ids.length })
}
