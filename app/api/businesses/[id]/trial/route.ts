import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'
import { parseJsonBody } from '@/lib/api-validation'
import { z } from 'zod'

const trialSchema = z.object({
  trial_until: z.string().datetime({ offset: true }).nullable(),
})

// PATCH /api/businesses/[id]/trial
// Body: { trial_until: string (ISO) | null }
// Superuser only. Sets or clears the trial period for a business.
// While trial_until > NOW(), the DB trigger auto-tags all new submissions as is_test = true.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service
    .from('businesses')
    .update({ trial_until: trial_until ?? null })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
