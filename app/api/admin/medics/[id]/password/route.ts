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

const resetMedicPasswordSchema = z.object({
  password: z.string()
    .min(12, 'Temporary password must be at least 12 characters')
    .regex(/[A-Z]/, 'Temporary password must include an uppercase letter')
    .regex(/[a-z]/, 'Temporary password must include a lowercase letter')
    .regex(/[0-9]/, 'Temporary password must include a number')
    .regex(/[^A-Za-z0-9]/, 'Temporary password must include a symbol'),
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

  const roleError = requireRole(account, 'admin')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const rateLimited = await enforceActionRateLimit({
    authClient: supabase,
    action: 'admin_medic_password_reset',
    actorUserId: userId!,
    actorRole: account!.role,
    actorName: account!.display_name,
    businessId: account!.business_id,
    route: '/api/admin/medics/[id]/password',
    targetId: resolvedParams.id,
    limit: 5,
    windowMs: 10 * 60_000,
    errorMessage: 'Too many medic password resets were requested. Please wait and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(req, resetMedicPasswordSchema)
  if (!parsed.success) return parsed.response

  const { data: targetMedic, error: targetError } = await supabase
    .from('user_accounts')
    .select('id, display_name, email, role, business_id')
    .eq('id', resolvedParams.id)
    .eq('business_id', account!.business_id)
    .in('role', ['medic', 'pending_medic'])
    .maybeSingle()

  if (targetError) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'admin_medic_password_reset',
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: account!.business_id,
      route: '/api/admin/medics/[id]/password',
      targetId: resolvedParams.id,
      errorMessage: targetError.message,
    })
    return logAndReturnInternalError('/api/admin/medics/[id]/password', targetError)
  }

  if (!targetMedic) {
    return NextResponse.json({ error: 'Medic account not found for this business.' }, { status: 404 })
  }

  const service = createServiceClient()

  const { error: resetError } = await service.auth.admin.updateUserById(targetMedic.id, {
    password: parsed.data.password,
    user_metadata: {
      temporary_password_required: true,
    },
  })

  if (resetError) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'admin_medic_password_reset',
      result: 'failure',
      actorUserId: userId,
      actorRole: account!.role,
      actorName: account!.display_name,
      businessId: account!.business_id,
      route: '/api/admin/medics/[id]/password',
      targetId: targetMedic.id,
      errorMessage: resetError.message,
    })
    return NextResponse.json({ error: 'Failed to reset medic password.' }, { status: 400 })
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'admin_medic_password_reset',
    result: 'success',
    actorUserId: userId,
    actorRole: account!.role,
    actorName: account!.display_name,
    businessId: account!.business_id,
    route: '/api/admin/medics/[id]/password',
    targetId: targetMedic.id,
    context: { target_role: targetMedic.role },
  })

  return NextResponse.json({
    ok: true,
    medic: {
      id: targetMedic.id,
      display_name: targetMedic.display_name,
      email: targetMedic.email,
    },
  })
}
