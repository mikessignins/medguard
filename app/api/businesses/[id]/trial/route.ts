import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'

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

  const body = await req.json()
  const { trial_until } = body

  // Accept a valid ISO date string or null (to clear the trial period)
  if (trial_until !== null && (typeof trial_until !== 'string' || isNaN(Date.parse(trial_until)))) {
    return NextResponse.json({ error: 'trial_until must be an ISO date string or null' }, { status: 400 })
  }

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
