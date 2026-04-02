import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CONFIDENTIAL_MEDICATION_MODULE_KEY } from '@/lib/modules'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  if (typeof body.confidential_med_dec_enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const nextEnabled = body.confidential_med_dec_enabled

  const { error: moduleError } = await service
    .from('business_modules')
    .upsert({
      business_id: params.id,
      module_key: CONFIDENTIAL_MEDICATION_MODULE_KEY,
      enabled: nextEnabled,
      disabled_at: nextEnabled ? null : new Date().toISOString(),
      config: {},
    }, { onConflict: 'business_id,module_key' })

  if (moduleError) return NextResponse.json({ error: moduleError.message }, { status: 500 })

  const { error: legacyError } = await service
    .from('businesses')
    .update({ confidential_med_dec_enabled: nextEnabled })
    .eq('id', params.id)

  if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
