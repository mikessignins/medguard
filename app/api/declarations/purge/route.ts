import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // 1. Auth — must be a signed-in medic
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
    .from('user_accounts').select('role').eq('id', user.id).single()
  if (!account || account.role !== 'medic') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // 2. Parse body
  let ids: string[]
  try {
    const body = await request.json()
    ids = Array.isArray(body.ids) ? body.ids : []
  } catch {
    return new NextResponse('Invalid request body', { status: 400 })
  }

  if (ids.length === 0) {
    return NextResponse.json({ purged: 0 })
  }

  // 3. Purge using service role (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await supabase
    .from('submissions')
    .update({
      phi_purged_at: new Date().toISOString(),
      worker_snapshot: {},
      script_uploads: [],
    })
    .in('id', ids)

  if (error) {
    console.error('[purge/route] update error:', error)
    return new NextResponse(`Purge failed: ${error.message}`, { status: 500 })
  }

  return NextResponse.json({ purged: ids.length })
}
