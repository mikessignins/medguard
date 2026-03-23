import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Vercel invokes this daily with Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Find submissions exported more than 7 days ago that haven't been purged yet
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: targets, error: fetchError } = await supabase
    .from('submissions')
    .select('id')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ purged: 0 })
  }

  const ids = targets.map(r => r.id)

  const { error: updateError } = await supabase
    .from('submissions')
    .update({
      phi_purged_at: new Date().toISOString(),
      worker_snapshot: null,
      script_uploads: null,
    })
    .in('id', ids)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ purged: ids.length })
}
