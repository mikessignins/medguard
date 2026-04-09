import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'
import { parseBusinessIdParam, parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const parsedBusinessId = parseBusinessIdParam(params.id)
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
    .select('role')
    .eq('id', userId)
    .single()

  const roleError = requireRole(account, 'superuser')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const parsed = await parseJsonBody(req, reminderIntervalSchema)
  if (!parsed.success) return parsed.response
  const { months } = parsed.data

  const { error } = await supabase
    .from('businesses')
    .update({ reminder_interval_months: months })
    .eq('id', parsedBusinessId.value)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
