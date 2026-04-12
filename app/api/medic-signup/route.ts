import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'

export const runtime = 'nodejs'

const medicSignupSchema = z.object({
  display_name: z.string().trim().min(1, 'Full name is required').max(120, 'Full name is too long'),
  email: z.string().trim().email('A valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  invite_code: z.string().trim().min(4, 'Invite code is required').max(32, 'Invite code is too long'),
})

export async function POST(req: Request) {
  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const parsed = await parseJsonBody(req, medicSignupSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data
  const service = createServiceClient()
  const normalizedEmail = body.email.trim().toLowerCase()
  const normalizedInviteCode = body.invite_code.trim().toUpperCase()

  const { data: inviteCode, error: inviteError } = await service
    .from('invite_codes')
    .select('business_id')
    .eq('code', normalizedInviteCode)
    .maybeSingle()

  if (inviteError) {
    return logAndReturnInternalError('/api/medic-signup', inviteError)
  }

  if (!inviteCode) {
    return NextResponse.json({ error: 'Invite code not found.' }, { status: 400 })
  }

  const businessId = inviteCode.business_id as string
  const { data: existingAccount, error: existingAccountError } = await service
    .from('user_accounts')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingAccountError) {
    return logAndReturnInternalError('/api/medic-signup', existingAccountError)
  }

  if (existingAccount) {
    return NextResponse.json(
      { error: 'A MedGuard account already exists for this email address.' },
      { status: 409 },
    )
  }

  const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
    email: normalizedEmail,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      display_name: body.display_name,
      role: 'pending_medic',
      business_id: businessId,
    },
  })

  if (createUserError || !createdUser.user) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'medic_signup_requested',
      result: 'failure',
      actorRole: 'pending_medic',
      businessId,
      route: '/api/medic-signup',
      errorMessage: createUserError?.message ?? 'Missing created user',
      context: { target_email: normalizedEmail },
    })
    return NextResponse.json({ error: 'Unable to create this medic account request.' }, { status: 400 })
  }

  const medicUserId = createdUser.user.id

  const { error: userIndexError } = await service
    .from('user_index')
    .upsert({
      user_id: medicUserId,
      business_id: businessId,
    }, { onConflict: 'user_id' })

  if (userIndexError) {
    await service.auth.admin.deleteUser(medicUserId).catch(() => undefined)
    return logAndReturnInternalError('/api/medic-signup', userIndexError)
  }

  const { error: accountError } = await service
    .from('user_accounts')
    .insert({
      id: medicUserId,
      business_id: businessId,
      display_name: body.display_name,
      email: normalizedEmail,
      role: 'pending_medic',
      site_ids: [],
    })

  if (accountError) {
    await service.auth.admin.deleteUser(medicUserId).catch(() => undefined)
    try {
      await service.from('user_index').delete().eq('user_id', medicUserId)
    } catch {}
    return logAndReturnInternalError('/api/medic-signup', accountError)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'medic_signup_requested',
    result: 'success',
    actorUserId: medicUserId,
    actorRole: 'pending_medic',
    actorName: body.display_name,
    businessId,
    route: '/api/medic-signup',
    targetId: medicUserId,
    context: { target_email: normalizedEmail },
  })

  return NextResponse.json({
    ok: true,
    message: 'Medic sign-up complete. You can sign in with your password now, but access will stay pending until a business admin approves you.',
  })
}
