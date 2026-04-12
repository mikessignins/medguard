import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'

export const runtime = 'nodejs'

const addBusinessAdminSchema = z.object({
  display_name: z.string().trim().min(1, 'Full name is required').max(120, 'Full name is too long'),
  email: z.string().trim().email('A valid email address is required'),
  temporary_password: z.string().min(8, 'Temporary password must be at least 8 characters').max(120, 'Temporary password is too long'),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params
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

  const roleError = requireRole(account, 'superuser')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const parsed = await parseJsonBody(req, addBusinessAdminSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  const service = createServiceClient()

  const { data: business, error: businessError } = await service
    .from('businesses')
    .select('id, name')
    .eq('id', resolvedParams.id)
    .maybeSingle()

  if (businessError) return logAndReturnInternalError('/api/superuser/businesses/[id]/admins', businessError)
  if (!business) return NextResponse.json({ error: 'Business not found.' }, { status: 404 })

  const normalizedEmail = body.email.trim().toLowerCase()
  const temporaryPassword = body.temporary_password

  const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
    email: normalizedEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      display_name: body.display_name,
      role: 'admin',
      business_id: business.id,
    },
  })

  if (createUserError || !createdUser.user) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'superuser_business_admin_created',
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: business.id,
      route: '/api/superuser/businesses/[id]/admins',
      errorMessage: createUserError?.message ?? 'Missing created user',
      context: { target_email: normalizedEmail },
    })
    return NextResponse.json({ error: 'Unable to create this admin account.' }, { status: 400 })
  }

  const adminUserId = createdUser.user.id

  const { error: userIndexError } = await service
    .from('user_index')
    .upsert({
      user_id: adminUserId,
      business_id: business.id,
    }, { onConflict: 'user_id' })

  if (userIndexError) {
    await service.auth.admin.deleteUser(adminUserId).catch(() => undefined)
    return logAndReturnInternalError('/api/superuser/businesses/[id]/admins', userIndexError)
  }

  const { error: accountInsertError } = await service
    .from('user_accounts')
    .insert({
      id: adminUserId,
      business_id: business.id,
      display_name: body.display_name,
      email: normalizedEmail,
      role: 'admin',
      site_ids: [],
    })

  if (accountInsertError) {
    await service.auth.admin.deleteUser(adminUserId).catch(() => undefined)
    try {
      await service.from('user_index').delete().eq('user_id', adminUserId)
    } catch {}
    return logAndReturnInternalError('/api/superuser/businesses/[id]/admins', accountInsertError)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'superuser_business_admin_created',
    result: 'success',
    actorUserId: userId,
    actorRole: account!.role,
    actorName: account!.display_name,
    businessId: business.id,
    route: '/api/superuser/businesses/[id]/admins',
    targetId: adminUserId,
    context: { target_email: normalizedEmail },
  })

  return NextResponse.json({
    ok: true,
    admin: {
      id: adminUserId,
      display_name: body.display_name,
      email: normalizedEmail,
    },
    temporary_password: temporaryPassword,
    message: 'Business admin created. Share the temporary password directly with them.',
  })
}
