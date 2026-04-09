import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireOneOfRoles } from '@/lib/route-access'
import { parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const feedbackPayloadSchema = z.object({
  category: z.enum(['Bug', 'Error', 'Idea', 'Other']),
  message: z.string().trim().min(1, 'Message is required').max(5000, 'Message is too long'),
})

export async function POST(req: Request) {
  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('display_name, role, business_id')
    .eq('id', userId)
    .single()

  const roleError = requireOneOfRoles(account, ['medic', 'admin', 'superuser'])
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })
  const allowedAccount = account!

  const rateLimited = await enforceActionRateLimit({
    authClient: supabase,
    action: 'feedback_submitted',
    actorUserId: userId!,
    actorRole: allowedAccount.role,
    actorName: allowedAccount.display_name,
    businessId: allowedAccount.business_id,
    route: '/api/feedback',
    limit: 8,
    windowMs: 10 * 60_000,
    errorMessage: 'Too much feedback was submitted in a short period. Please wait a few minutes and try again.',
  })
  if (rateLimited) return rateLimited

  const parsed = await parseJsonBody(req, feedbackPayloadSchema)
  if (!parsed.success) return parsed.response
  const { category, message } = parsed.data

  const { error } = await supabase.from('feedback').insert({
    id: crypto.randomUUID(),
    submitted_by_user_id: userId,
    submitted_by_name: allowedAccount.display_name,
    submitted_by_role: allowedAccount.role,
    business_id: allowedAccount.business_id,
    category,
    message,
  })

  if (error) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'feedback_submitted',
      result: 'failure',
      actorUserId: userId,
      actorRole: allowedAccount.role,
      actorName: allowedAccount.display_name,
      businessId: allowedAccount.business_id,
      route: '/api/feedback',
      errorMessage: error.message,
      context: { category },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'feedback_submitted',
    result: 'success',
    actorUserId: userId,
    actorRole: allowedAccount.role,
    actorName: allowedAccount.display_name,
    businessId: allowedAccount.business_id,
    route: '/api/feedback',
    context: { category },
  })

  return NextResponse.json({ ok: true })
}
