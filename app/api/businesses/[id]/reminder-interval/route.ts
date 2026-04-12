import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireScopedBusinessAccess } from '@/lib/route-access'
import { parseBusinessIdParam, parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { z } from 'zod'

const reminderIntervalSchema = z.object({
  months: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(6),
    z.literal(12),
  ]),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const parsedBusinessId = parseBusinessIdParam(resolvedParams.id)
  if (!parsedBusinessId.success) return parsedBusinessId.response

  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, display_name, business_id, superuser_scope')
    .eq('id', userId)
    .single()

  const roleError = requireScopedBusinessAccess(account, parsedBusinessId.value)
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const parsed = await parseJsonBody(req, reminderIntervalSchema)
  if (!parsed.success) return parsed.response
  const { months } = parsed.data

  const { error } = await supabase
    .from('businesses')
    .update({ reminder_interval_months: months })
    .eq('id', parsedBusinessId.value)

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'business_reminder_interval_updated',
      result: 'failure',
      actorUserId: userId,
      actorRole: account?.role,
      actorName: account?.display_name,
      businessId: parsedBusinessId.value,
      route: '/api/businesses/[id]/reminder-interval',
      targetId: parsedBusinessId.value,
      errorMessage: error.message,
      context: { months },
    })
    return logAndReturnInternalError('/api/businesses/[id]/reminder-interval', error)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'business_reminder_interval_updated',
    result: 'success',
    actorUserId: userId,
    actorRole: account?.role,
    actorName: account?.display_name,
    businessId: parsedBusinessId.value,
    route: '/api/businesses/[id]/reminder-interval',
    targetId: parsedBusinessId.value,
    context: { months },
  })

  return NextResponse.json({ ok: true })
}
