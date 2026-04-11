import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'
import { z } from 'zod'

export const runtime = 'nodejs'

const contractorMedicSchema = z.object({
  display_name: z.string().trim().min(1, 'Full name is required').max(120, 'Full name is too long'),
  email: z.string().trim().email('A valid email address is required'),
  password: z.string()
    .min(12, 'Temporary password must be at least 12 characters')
    .regex(/[A-Z]/, 'Temporary password must include an uppercase letter')
    .regex(/[a-z]/, 'Temporary password must include a lowercase letter')
    .regex(/[0-9]/, 'Temporary password must include a number')
    .regex(/[^A-Za-z0-9]/, 'Temporary password must include a symbol'),
  site_ids: z.array(z.string().trim().min(1)).default([]),
  contract_end_date: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Contract end date must be in YYYY-MM-DD format'),
    z.null(),
  ]).optional().default(null),
})

export async function POST(req: Request) {
  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, display_name, business_id')
    .eq('id', userId)
    .single()

  const roleError = requireRole(account, 'admin')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const rateLimited = await enforceActionRateLimit({
    authClient: supabase,
    action: 'admin_contractor_medic_created',
    actorUserId: userId!,
    actorRole: account!.role,
    actorName: account!.display_name,
    businessId: account!.business_id,
    route: '/api/admin/contractor-medics',
    limit: 10,
    windowMs: 10 * 60_000,
    errorMessage: 'Too many contractor medic accounts were requested. Please wait and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(req, contractorMedicSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const normalizedSiteIds = Array.from(new Set(body.site_ids))
  if (normalizedSiteIds.length > 0) {
    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select('id')
      .eq('business_id', account!.business_id)
      .in('id', normalizedSiteIds)

    if (sitesError) {
      return NextResponse.json({ error: 'Unable to validate selected sites.' }, { status: 500 })
    }

    if ((sites ?? []).length !== normalizedSiteIds.length) {
      return NextResponse.json({ error: 'One or more selected sites are invalid for this business.' }, { status: 400 })
    }
  }

  const service = createServiceClient()

  const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      display_name: body.display_name,
      role: 'medic',
      business_id: account!.business_id,
      temporary_password_required: true,
    },
  })

  if (createUserError || !createdUser.user) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'admin_contractor_medic_created',
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: account!.business_id,
      route: '/api/admin/contractor-medics',
      errorMessage: createUserError?.message ?? 'Missing created user',
      context: { target_email: body.email, site_count: normalizedSiteIds.length },
    })
    return NextResponse.json(
      { error: 'Failed to create medic sign-in account.' },
      { status: 400 },
    )
  }

  const medicUserId = createdUser.user.id
  const { error: userIndexError } = await service
    .from('user_index')
    .upsert({
      user_id: medicUserId,
      business_id: account!.business_id,
    }, { onConflict: 'user_id' })

  if (userIndexError) {
    await service.auth.admin.deleteUser(medicUserId).catch(() => undefined)
    await safeLogServerEvent({
      source: 'web_api',
      action: 'admin_contractor_medic_created',
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: account!.business_id,
      route: '/api/admin/contractor-medics',
      targetId: medicUserId,
      errorMessage: userIndexError.message,
    })
    return logAndReturnInternalError('/api/admin/contractor-medics', userIndexError)
  }

  const { error: accountInsertError } = await service
    .from('user_accounts')
    .insert({
      id: medicUserId,
      business_id: account!.business_id,
      display_name: body.display_name,
      email: body.email,
      role: 'medic',
      site_ids: normalizedSiteIds,
      contract_end_date: body.contract_end_date,
    })

  if (accountInsertError) {
    await service.auth.admin.deleteUser(medicUserId).catch(() => undefined)
    try {
      await service.from('user_index').delete().eq('user_id', medicUserId)
    } catch {}
    await safeLogServerEvent({
      source: 'web_api',
      action: 'admin_contractor_medic_created',
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: account!.business_id,
      route: '/api/admin/contractor-medics',
      targetId: medicUserId,
      errorMessage: accountInsertError.message,
    })
    return logAndReturnInternalError('/api/admin/contractor-medics', accountInsertError)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'admin_contractor_medic_created',
    result: 'success',
    actorUserId: userId,
    actorRole: account!.role,
    actorName: account!.display_name,
    businessId: account!.business_id,
    route: '/api/admin/contractor-medics',
    targetId: medicUserId,
    context: {
      target_email: body.email,
      site_count: normalizedSiteIds.length,
      contract_end_date: body.contract_end_date,
    },
  })

  return NextResponse.json({
    ok: true,
    user: {
      id: medicUserId,
      display_name: body.display_name,
      email: body.email,
      role: 'medic',
      site_ids: normalizedSiteIds,
      contract_end_date: body.contract_end_date,
    },
  })
}
