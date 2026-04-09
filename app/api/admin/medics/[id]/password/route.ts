import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'
import { z } from 'zod'

export const runtime = 'nodejs'

const resetMedicPasswordSchema = z.object({
  password: z.string().min(8, 'Temporary password must be at least 8 characters'),
})

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
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
    .select('role, business_id')
    .eq('id', userId)
    .single()

  const roleError = requireRole(account, 'admin')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const parsed = await parseJsonBody(req, resetMedicPasswordSchema)
  if (!parsed.success) return parsed.response

  const { data: targetMedic, error: targetError } = await supabase
    .from('user_accounts')
    .select('id, display_name, email, role, business_id')
    .eq('id', params.id)
    .eq('business_id', account!.business_id)
    .in('role', ['medic', 'pending_medic'])
    .maybeSingle()

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 })
  }

  if (!targetMedic) {
    return NextResponse.json({ error: 'Medic account not found for this business.' }, { status: 404 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error: resetError } = await service.auth.admin.updateUserById(targetMedic.id, {
    password: parsed.data.password,
  })

  if (resetError) {
    return NextResponse.json(
      { error: resetError.message || 'Failed to reset medic password.' },
      { status: 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    medic: {
      id: targetMedic.id,
      display_name: targetMedic.display_name,
      email: targetMedic.email,
    },
  })
}
