import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: account } = await authClient
    .from('user_accounts')
    .select('role, display_name, business_id')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let body: {
    action: string
    target_user_id?: string | null
    target_name?: string | null
    detail?: Record<string, unknown> | null
  }
  try {
    body = await request.json()
  } catch {
    return new NextResponse('Invalid request body', { status: 400 })
  }

  if (!body.action?.trim()) {
    return new NextResponse('action is required', { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await supabase.from('admin_action_log').insert({
    business_id:    account.business_id,
    actor_user_id:  user.id,
    actor_name:     account.display_name as string,
    action:         body.action.trim(),
    target_user_id: body.target_user_id ?? null,
    target_name:    body.target_name ?? null,
    detail:         body.detail ?? null,
  })

  if (error) {
    console.error('[admin/audit] insert error:', error)
    return new NextResponse(error.message, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
