import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
    .from('user_accounts').select('role, display_name').eq('id', user.id).single()
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

  // 3. Fetch submission data before wiping (for audit log)
  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, business_id, site_id, worker_snapshot')
    .in('id', ids)

  // 4. Fetch site names
  const siteIds = [...new Set((submissions ?? []).map(s => s.site_id).filter(Boolean))]
  const { data: sites } = siteIds.length > 0
    ? await supabase.from('sites').select('id, name').in('id', siteIds)
    : { data: [] }
  const siteMap = Object.fromEntries((sites ?? []).map(s => [s.id, s.name]))

  // 5. Build audit log entries
  const purgedAt = new Date().toISOString()
  const auditRows = (submissions ?? []).map(sub => {
    const ws = sub.worker_snapshot as Record<string, unknown> | null
    return {
      submission_id: sub.id,
      worker_name: (ws?.fullName as string) ?? null,
      worker_dob: (ws?.dateOfBirth as string) ?? null,
      site_id: sub.site_id ?? null,
      site_name: sub.site_id ? (siteMap[sub.site_id] ?? null) : null,
      business_id: sub.business_id,
      medic_user_id: user.id,
      medic_name: account.display_name as string,
      purged_at: purgedAt,
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
      worker_snapshot: {},
      script_uploads: [],
    })
    .in('id', ids)

  if (error) {
    console.error('[purge/route] update error:', error)
    return new NextResponse(`Purge failed: ${error.message}`, { status: 500 })
  }

  return NextResponse.json({ purged: ids.length })
}
