import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'

export const runtime = 'nodejs'

const createBusinessSchema = z.object({
  business_id: z.string().trim().min(1, 'Business ID is required').max(80, 'Business ID is too long'),
  business_name: z.string().trim().min(1, 'Business name is required').max(160, 'Business name is too long'),
  contact_email: z.string().trim().email('A valid contact email is required'),
  admin_display_name: z.string().trim().min(1, 'Admin name is required').max(120, 'Admin name is too long'),
  admin_email: z.string().trim().email('A valid admin email is required'),
  temporary_password: z.string().min(8, 'Temporary password must be at least 8 characters').max(120, 'Temporary password is too long'),
})

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => chars[byte % chars.length]).join('')
}

async function createUniqueInviteCode(service: ReturnType<typeof createServiceClient>, businessId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode()
    const { error } = await service
      .from('invite_codes')
      .insert({ business_id: businessId, code })

    if (!error) return code
    if (error.code !== '23505') throw error
  }

  throw new Error('Unable to generate a unique invite code.')
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
    .select('role, display_name')
    .eq('id', userId)
    .single()

  const roleError = requireRole(account, 'superuser')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const parsed = await parseJsonBody(req, createBusinessSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  const service = createServiceClient()
  const businessId = body.business_id
  const normalizedAdminEmail = body.admin_email.trim().toLowerCase()
  const temporaryPassword = body.temporary_password
  let adminUserId: string | null = null

  try {
    const { error: businessError } = await service
      .from('businesses')
      .insert({
        id: businessId,
        name: body.business_name,
        contact_email: body.contact_email,
      })

    if (businessError) throw businessError

    const inviteCode = await createUniqueInviteCode(service, businessId)

    const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
      email: normalizedAdminEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        display_name: body.admin_display_name,
        role: 'admin',
        business_id: businessId,
      },
    })

    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error('Missing created user')
    }

    adminUserId = createdUser.user.id

    const { error: userIndexError } = await service
      .from('user_index')
      .upsert({ user_id: adminUserId, business_id: businessId }, { onConflict: 'user_id' })
    if (userIndexError) throw userIndexError

    const { error: accountInsertError } = await service
      .from('user_accounts')
      .insert({
        id: adminUserId,
        business_id: businessId,
        display_name: body.admin_display_name,
        email: normalizedAdminEmail,
        role: 'admin',
        site_ids: [],
      })
    if (accountInsertError) throw accountInsertError

    await safeLogServerEvent({
      source: 'web_api',
      action: 'superuser_business_created',
      result: 'success',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId,
      route: '/api/superuser/businesses',
      targetId: adminUserId,
      context: { admin_email: normalizedAdminEmail },
    })

    return NextResponse.json({
      ok: true,
      invite_code: inviteCode,
      business: {
        id: businessId,
        name: body.business_name,
        contact_email: body.contact_email,
      },
      admin: {
        id: adminUserId,
        display_name: body.admin_display_name,
        email: normalizedAdminEmail,
      },
      temporary_password: temporaryPassword,
      message: 'Business created. Share the temporary password and invite code with the business admin.',
    })
  } catch (error) {
    if (adminUserId) await service.auth.admin.deleteUser(adminUserId).catch(() => undefined)
    try {
      await service.from('user_index').delete().eq('user_id', adminUserId ?? '')
      await service.from('user_accounts').delete().eq('id', adminUserId ?? '')
      await service.from('invite_codes').delete().eq('business_id', businessId)
      await service.from('businesses').delete().eq('id', businessId)
    } catch {}

    await safeLogServerEvent({
      source: 'web_api',
      action: 'superuser_business_created',
      result: 'failure',
      actorUserId: userId,
      actorRole: account?.role,
      actorName: account?.display_name,
      businessId,
      route: '/api/superuser/businesses',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      context: { admin_email: normalizedAdminEmail },
    })

    return logAndReturnInternalError('/api/superuser/businesses', error)
  }
}
