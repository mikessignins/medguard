import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('display_name, role, business_id')
    .eq('id', user.id)
    .single()

  if (!account || !['medic', 'admin'].includes(account.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
    submitted_by_user_id: user.id,
    submitted_by_name: account.display_name,
    submitted_by_role: account.role,
    business_id: account.business_id,
    category,
    message: message.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
