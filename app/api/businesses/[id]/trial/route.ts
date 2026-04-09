import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'
import { parseBusinessIdParam, parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { z } from 'zod'

const trialSchema = z.object({
  trial_until: z.string().datetime({ offset: true }).nullable(),
})

// PATCH /api/businesses/[id]/trial
// Body: { trial_until: string (ISO) | null }
// Superuser only. Sets or clears the trial period for a business.
// While trial_until > NOW(), the DB trigger auto-tags all new submissions as is_test = true.
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

  const parsed = await parseJsonBody(req, trialSchema)
  if (!parsed.success) return parsed.response
  const { trial_until } = parsed.data

  const { error } = await supabase
    .from('businesses')
    .update({ trial_until: trial_until ?? null })
    .eq('id', parsedBusinessId.value)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
