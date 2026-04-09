import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { validatePurgeSelection } from '@/lib/purge-guards'
import { requireAuthenticatedUser, requireMedicScope, requireRole } from '@/lib/route-access'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { emergencyPurgeRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request)
  if (csrfError) return csrfError

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
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return new NextResponse(authError.error, { status: authError.status })

  const { data: account } = await authClient
    .from('user_accounts').select('role, display_name, business_id, site_ids').eq('id', userId).single()
  const roleError = requireRole(account, 'medic')
  if (roleError) return new NextResponse(roleError.error, { status: roleError.status })
  const medicAccount = account!

  // 2. Parse body
  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'emergency_purge_completed',
    actorUserId: userId!,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'emergency_declaration',
    route: '/api/declarations/purge',
    limit: 5,
    windowMs: 15 * 60_000,
    errorMessage: 'Too many purge requests were submitted. Please wait before trying again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(request, emergencyPurgeRequestSchema)
  if (!parsed.success) return parsed.response
  const { ids } = parsed.data

  if (ids.length === 0) {
    return NextResponse.json({ purged: 0 })
  }

  // 3. Fetch submission data before wiping — guard: all must be exported first
  const { data: submissions } = await authClient
    .from('submissions')
    .select('id, business_id, site_id, site_name, worker_snapshot, exported_at, exported_by_name, decision')
    .in('id', ids)

  const purgeError = validatePurgeSelection(ids, submissions ?? [])
  if (purgeError) {
    return NextResponse.json({ error: purgeError.error }, { status: purgeError.status })
  }

  const outOfScope = (submissions ?? []).some((submission) => requireMedicScope(medicAccount, submission))
  if (outOfScope) {
    return new NextResponse('Forbidden', { status: 403 })
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
      medic_user_id:    userId,
      medic_name:       medicAccount.display_name as string,
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
    const { error: auditError } = await authClient.from('purge_audit_log').insert(auditRows)
    if (auditError) console.error('[purge/route] audit log error:', auditError)
  }

  // 7. Wipe PHI
  const { error } = await authClient
    .from('submissions')
    .update({
      phi_purged_at: purgedAt,
      worker_snapshot: null,
      script_uploads: null,
    })
    .in('id', ids)

  if (error) {
    console.error('[purge/route] update error:', error)
    await safeLogServerEvent({
      source: 'web_api',
      action: 'emergency_purge_completed',
      result: 'failure',
      actorUserId: userId,
      actorRole: medicAccount.role,
      actorName: medicAccount.display_name,
      businessId: medicAccount.business_id,
      moduleKey: 'emergency_declaration',
      route: '/api/declarations/purge',
      errorMessage: error.message,
      context: { purge_count: ids.length },
    })
    return new NextResponse(`Purge failed: ${error.message}`, { status: 500 })
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'emergency_purge_completed',
    result: 'success',
    actorUserId: userId,
    actorRole: medicAccount.role,
    actorName: medicAccount.display_name,
    businessId: medicAccount.business_id,
    moduleKey: 'emergency_declaration',
    route: '/api/declarations/purge',
    context: { purge_count: ids.length },
  })

  return NextResponse.json({ purged: ids.length })
}
