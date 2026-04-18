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

const contractorStaffSchema = z.object({
  display_name: z.string().trim().min(1, 'Full name is required').max(120, 'Full name is too long'),
  email: z.string().trim().email('A valid email address is required'),
  temporary_password: z.string().min(8, 'Temporary password must be at least 8 characters').max(120, 'Temporary password is too long'),
  site_ids: z.array(z.string().trim().min(1)).default([]),
  role: z.enum(['medic', 'occ_health']).optional().default('medic'),
  contract_end_date: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Contract end date must be in YYYY-MM-DD format'),
    z.null(),
  ]).optional().default(null),
})

async function findAuthUserByEmail(
  service: ReturnType<typeof createServiceClient>,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase()
  let page = 1

  while (page <= 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail)
    if (match) return match

    if (data.users.length < 1000) return null
    page += 1
  }

  return null
}

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

  const parsed = await parseJsonBody(req, contractorStaffSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  const targetRole = body.role
  const roleLabel = targetRole === 'occ_health' ? 'occ health' : 'medic'

  const rateLimited = await enforceActionRateLimit({
    authClient: supabase,
    action: `admin_contractor_${targetRole}_created`,
    actorUserId: userId!,
    actorRole: account!.role,
    actorName: account!.display_name,
    businessId: account!.business_id,
    route: '/api/admin/contractor-medics',
    limit: 10,
    windowMs: 10 * 60_000,
    errorMessage: `Too many contractor ${roleLabel} accounts were requested. Please wait and try again.`,
  })
  if (rateLimited) return rateLimited

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
  const temporaryPassword = body.temporary_password
  const normalizedEmail = body.email.toLowerCase()

  const { data: existingAccounts, error: existingAccountsError } = await service
    .from('user_accounts')
    .select('id, business_id, role')
    .eq('email', normalizedEmail)

  if (existingAccountsError) {
    return logAndReturnInternalError('/api/admin/contractor-medics', existingAccountsError)
  }

  if ((existingAccounts ?? []).length > 0) {
    return NextResponse.json(
      { error: 'A MedGuard account already exists for this email address.' },
      { status: 409 },
    )
  }

  let staffUserId: string | null = null
  let createdAuthUser = false

  const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
    email: normalizedEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      display_name: body.display_name,
      role: targetRole,
      business_id: account!.business_id,
    },
  })

  if (createUserError || !createdUser.user) {
    if (createUserError?.message?.toLowerCase().includes('already been registered')) {
      try {
        const existingAuthUser = await findAuthUserByEmail(service, normalizedEmail)

        if (existingAuthUser) {
          const { error: updateUserError } = await service.auth.admin.updateUserById(existingAuthUser.id, {
            password: temporaryPassword,
            user_metadata: {
              ...existingAuthUser.user_metadata,
              display_name: body.display_name,
              role: targetRole,
              business_id: account!.business_id,
            },
          })

          if (updateUserError) throw updateUserError
          staffUserId = existingAuthUser.id
        }
      } catch (reuseError) {
        await safeLogServerEvent({
          source: 'web_api',
          action: `admin_contractor_${targetRole}_created`,
          result: 'failure',
          actorUserId: userId,
          actorRole: account!.role,
          actorName: account!.display_name,
          businessId: account!.business_id,
          route: '/api/admin/contractor-medics',
          errorMessage: reuseError instanceof Error ? reuseError.message : 'Failed to reuse existing auth user',
          context: { target_email: normalizedEmail, site_count: normalizedSiteIds.length, role: targetRole },
        })
        return NextResponse.json(
          { error: `Failed to repair existing ${roleLabel} sign-in account.` },
          { status: 400 },
        )
      }
    }

    if (!staffUserId) {
      await safeLogServerEvent({
        source: 'web_api',
        action: `admin_contractor_${targetRole}_created`,
        result: 'failure',
        actorUserId: userId,
        actorRole: account!.role,
        actorName: account!.display_name,
        businessId: account!.business_id,
        route: '/api/admin/contractor-medics',
        errorMessage: createUserError?.message ?? 'Missing created user',
        context: { target_email: normalizedEmail, site_count: normalizedSiteIds.length, role: targetRole },
      })
      return NextResponse.json(
        { error: `Failed to create ${roleLabel} sign-in account.` },
        { status: 400 },
      )
    }
  } else {
    staffUserId = createdUser.user.id
    createdAuthUser = true
  }

  if (!staffUserId) {
    await safeLogServerEvent({
      source: 'web_api',
      action: `admin_contractor_${targetRole}_created`,
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: account!.business_id,
      route: '/api/admin/contractor-medics',
      errorMessage: 'Missing staff user id',
      context: { target_email: normalizedEmail, site_count: normalizedSiteIds.length, role: targetRole },
    })
    return NextResponse.json(
      { error: `Failed to create ${roleLabel} sign-in account.` },
      { status: 400 },
    )
  }

  const { error: userIndexError } = await service
    .from('user_index')
    .upsert({
      user_id: staffUserId,
      business_id: account!.business_id,
    }, { onConflict: 'user_id' })

  if (userIndexError) {
    if (createdAuthUser) await service.auth.admin.deleteUser(staffUserId).catch(() => undefined)
    await safeLogServerEvent({
      source: 'web_api',
      action: `admin_contractor_${targetRole}_created`,
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: account!.business_id,
      route: '/api/admin/contractor-medics',
      targetId: staffUserId,
      errorMessage: userIndexError.message,
    })
    return logAndReturnInternalError('/api/admin/contractor-medics', userIndexError)
  }

  const { error: accountInsertError } = await service
    .from('user_accounts')
    .insert({
      id: staffUserId,
      business_id: account!.business_id,
      display_name: body.display_name,
      email: normalizedEmail,
      role: targetRole,
      site_ids: normalizedSiteIds,
      contract_end_date: body.contract_end_date,
    })

  if (accountInsertError) {
    if (createdAuthUser) await service.auth.admin.deleteUser(staffUserId).catch(() => undefined)
    try {
      await service.from('user_index').delete().eq('user_id', staffUserId)
    } catch {}
    await safeLogServerEvent({
      source: 'web_api',
      action: `admin_contractor_${targetRole}_created`,
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: account!.business_id,
      route: '/api/admin/contractor-medics',
      targetId: staffUserId,
      errorMessage: accountInsertError.message,
    })
    return logAndReturnInternalError('/api/admin/contractor-medics', accountInsertError)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: `admin_contractor_${targetRole}_created`,
    result: 'success',
    actorUserId: userId,
    actorRole: account!.role,
    actorName: account!.display_name,
    businessId: account!.business_id,
    route: '/api/admin/contractor-medics',
    targetId: staffUserId,
    context: {
      target_email: normalizedEmail,
      site_count: normalizedSiteIds.length,
      contract_end_date: body.contract_end_date,
      reused_auth_user: !createdAuthUser,
      role: targetRole,
    },
  })

  return NextResponse.json({
    ok: true,
    user: {
      id: staffUserId,
      display_name: body.display_name,
      email: normalizedEmail,
      role: targetRole,
      site_ids: normalizedSiteIds,
      contract_end_date: body.contract_end_date,
    },
    temporary_password: temporaryPassword,
    message: `${targetRole === 'occ_health' ? 'Occ health' : 'Medic'} account created. Share the temporary password directly with them.`,
  })
}
