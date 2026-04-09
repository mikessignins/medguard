import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { count, error } = await service
    .from('feedback')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Unread')

  if (error) {
    console.error('[superuser/feedback/unread-count] count error:', error)
    return NextResponse.json({ error: 'Failed to load unread feedback count' }, { status: 500 })
  }

  return NextResponse.json({ unread_count: count ?? 0 })
}
