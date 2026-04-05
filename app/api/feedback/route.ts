import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireOneOfRoles } from '@/lib/route-access'

export async function POST(req: Request) {
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

  const roleError = requireOneOfRoles(account, ['medic', 'admin'])
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })
  const allowedAccount = account!

  const { category, message } = await req.json()

  if (!category || !message?.trim()) {
    return NextResponse.json({ error: 'Category and message are required' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await service.from('feedback').insert({
    id: crypto.randomUUID(),
    submitted_by_user_id: userId,
    submitted_by_name: allowedAccount.display_name,
    submitted_by_role: allowedAccount.role,
    business_id: allowedAccount.business_id,
    category,
    message: message.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
