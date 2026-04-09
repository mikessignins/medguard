import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAuthenticatedUser, requireMedicScope, requireRole } from '@/lib/route-access'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { medicationPurgeRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request)
  if (csrfError) return csrfError

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
  if (authError) return new NextResponse(authError.error, { status: authError.status })

  const { data: account } = await authClient
    .from('user_accounts').select('role, display_name, business_id, site_ids').eq('id', userId).single()
  const roleError = requireRole(account, 'medic')
  if (roleError) return new NextResponse(roleError.error, { status: roleError.status })
  const medicAccount = account!

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'medication_purge_completed',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'confidential_medication',
    route: '/api/medication-declarations/purge',
    limit: 5,
    windowMs: 15 * 60_000,
    errorMessage: 'Too many medication purge requests were submitted. Please wait before trying again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, medicationPurgeRequestSchema)
  if (!parsed.success) return parsed.response
  const { ids } = parsed.data

  if (ids.length === 0) {
    return NextResponse.json({ purged: 0 })
  }

  // Fetch med decs before wiping — guard: all must be exported first
  const { data: medDecs } = await authClient
    .from('medication_declarations')
    .select('id, business_id, site_id, site_name, worker_name, worker_dob, exported_at, exported_by_name, medic_name, medic_reviewed_at')
    .in('id', ids)

  if ((medDecs ?? []).length !== ids.length) {
    return NextResponse.json({ error: 'One or more declarations were not found.' }, { status: 404 })
  }

  const outOfScope = (medDecs ?? []).some((declaration) => requireMedicScope(medicAccount, declaration))
  if (outOfScope) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const unexported = (medDecs ?? []).filter(m => !m.exported_at)
  if (unexported.length > 0) {
    return NextResponse.json(
      { error: 'All declarations must be exported to PDF before purging.' },
      { status: 400 }
    )
  }

  // Build audit log entries (site_name already snapshotted on row since migration 002)
  const purgedAt = new Date().toISOString()
  const auditRows = (medDecs ?? []).map(m => ({
    submission_id:    m.id,
    worker_name:      m.worker_name ?? null,
    worker_dob:       m.worker_dob ?? null,
    site_id:          m.site_id ?? null,
    site_name:        m.site_name ?? null,
    business_id:      m.business_id,
    medic_user_id:    userId,
    medic_name:       medicAccount.display_name as string,
    purged_at:        purgedAt,
    form_type:        'medication_declaration',
    exported_at:      m.exported_at ?? null,
    exported_by_name: m.exported_by_name ?? null,
    approved_by_name: m.medic_name ?? null,
    approved_at:      m.medic_reviewed_at ?? null,
  }))

  // Wipe PHI first so the audit log never claims a purge that failed.
  const { error } = await authClient
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
    await safeLogServerEvent({
      source: 'web_api',
      action: 'medication_purge_completed',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'confidential_medication',
      route: '/api/medication-declarations/purge',
      errorMessage: error.message,
      context: { purge_count: ids.length },
    })
    return new NextResponse(`Purge failed: ${error.message}`, { status: 500 })
  }

  if (auditRows.length > 0) {
    const { error: auditError } = await authClient.from('purge_audit_log').insert(auditRows)
    if (auditError) console.error('[med-dec/purge] audit log error after purge:', auditError)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'medication_purge_completed',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'confidential_medication',
    route: '/api/medication-declarations/purge',
    context: { purge_count: ids.length },
  })

  return NextResponse.json({ purged: ids.length })
}
