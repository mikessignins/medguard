import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch med decs before wiping — guard: all must be exported first
  const { data: medDecs } = await supabase
    .from('medication_declarations')
    .select('id, business_id, site_id, worker_name, worker_dob, exported_at')
    .in('id', ids)

  const unexported = (medDecs ?? []).filter(m => !m.exported_at)
  if (unexported.length > 0) {
    return NextResponse.json(
      { error: 'All declarations must be exported to PDF before purging.' },
      { status: 400 }
    )
  }

  // Fetch site names
  const allSiteIds = (medDecs ?? []).map(m => m.site_id).filter((id): id is string => !!id)
  const uniqueSiteIds = allSiteIds.filter((id, i) => allSiteIds.indexOf(id) === i)
  let siteMap: Record<string, string> = {}
  if (uniqueSiteIds.length > 0) {
    const { data: sites } = await supabase.from('sites').select('id, name').in('id', uniqueSiteIds)
    siteMap = Object.fromEntries((sites ?? []).map(s => [s.id, s.name]))
  }

  // Build audit log entries
  const purgedAt = new Date().toISOString()
  const auditRows = (medDecs ?? []).map(m => ({
    submission_id: m.id,
    worker_name: m.worker_name ?? null,
    worker_dob: m.worker_dob ?? null,
    site_id: m.site_id ?? null,
    site_name: m.site_id ? (siteMap[m.site_id] ?? null) : null,
    business_id: m.business_id,
    medic_user_id: user.id,
    medic_name: account.display_name as string,
    purged_at: purgedAt,
    form_type: 'medication_declaration',
  }))

  if (auditRows.length > 0) {
    const { error: auditError } = await supabase.from('purge_audit_log').insert(auditRows)
    if (auditError) console.error('[med-dec/purge] audit log error:', auditError)
  }

  // Wipe PHI
  const { error } = await supabase
    .from('medication_declarations')
    .update({
      phi_purged_at: purgedAt,
      worker_name: '',
      worker_dob: '',
      employer: '',
      department: '',
      job_title: '',
      medications: [],
      script_uploads: [],
    })
    .in('id', ids)

  if (error) {
    console.error('[med-dec/purge] update error:', error)
    return new NextResponse(`Purge failed: ${error.message}`, { status: 500 })
  }

  return NextResponse.json({ purged: ids.length })
}
