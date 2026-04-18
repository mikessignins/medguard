import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireActiveMedic, requireAuthenticatedUser, requireMedicScope } from '@/lib/route-access'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { medicationPurgeRequestSchema } from '@/lib/review-request-schemas'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { validatePurgeSelection } from '@/lib/purge-guards'

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
    .from('user_accounts').select('role, display_name, business_id, site_ids, is_inactive, contract_end_date').eq('id', userId).single()
  const roleError = requireActiveMedic(account)
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

  // Fetch med decs before wiping. Production records must be exported and confirmed; reviewed test records can be purged without export.
  const { data: medDecs } = await authClient
    .from('medication_declarations')
    .select('id, business_id, site_id, site_name, worker_name, worker_dob, medic_review_status, exported_at, export_confirmed_at, export_confirmed_by_name, exported_by_name, medic_name, medic_reviewed_at, medical_officer_name, medical_officer_practice, is_test')
    .in('id', ids)

  const purgeError = validatePurgeSelection(
    ids,
    (medDecs ?? []).map((declaration) => ({
      id: declaration.id,
      exported_at: declaration.exported_at,
      export_confirmed_at: declaration.export_confirmed_at,
      is_test: declaration.is_test,
      status: declaration.medic_review_status,
    })),
    {
      testFinalStatuses: ['Normal Duties', 'Restricted Duties', 'Unfit for Work'],
      notFoundError: 'One or more declarations were not found.',
      blockedError: 'All production medication declarations must be exported and confirmed before health information can be purged. Reviewed test records can be purged without export.',
    },
  )
  if (purgeError) return NextResponse.json({ error: purgeError.error }, { status: purgeError.status })

  const outOfScope = (medDecs ?? []).some((declaration) => requireMedicScope(medicAccount, declaration))
  if (outOfScope) {
    return new NextResponse('Forbidden', { status: 403 })
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
    export_confirmed_at: m.export_confirmed_at ?? null,
    export_confirmed_by_name: m.export_confirmed_by_name ?? null,
    approved_by_name: m.medic_name ?? null,
    approved_at:      m.medic_reviewed_at ?? null,
    medical_officer_name: m.medical_officer_name ?? null,
    medical_officer_practice: m.medical_officer_practice ?? null,
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
    return logAndReturnInternalError('/api/medication-declarations/purge', error)
  }

  if (auditRows.length > 0) {
    const { error: auditError } = await authClient.from('purge_audit_log').insert(auditRows)
    if (auditError) {
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
        errorMessage: auditError.message,
        context: { purge_count: ids.length, purge_completed_but_audit_failed: true },
      })
      return logAndReturnInternalError('/api/medication-declarations/purge', auditError)
    }
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
