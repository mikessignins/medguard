import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isKnownModuleKey, MODULE_REGISTRY, type ModuleKey } from '@/lib/modules'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'

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
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
  }

  const moduleKey: ModuleKey = typeof body.moduleKey === 'string' && isKnownModuleKey(body.moduleKey)
    ? body.moduleKey
    : 'confidential_medication'

  const registry = MODULE_REGISTRY[moduleKey]
  if (!registry) {
    return NextResponse.json({ error: 'Unknown module' }, { status: 400 })
  }

  if (registry.category === 'core' && body.enabled !== true) {
    return NextResponse.json({ error: 'Core modules must remain enabled' }, { status: 400 })
  }

  if (!registry.canActivate && body.enabled === true) {
    return NextResponse.json({ error: 'This module is not ready to activate yet' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const nextEnabled = body.enabled

  const { data: existingRow } = await service
    .from('business_modules')
    .select('config, enabled_at')
    .eq('business_id', params.id)
    .eq('module_key', moduleKey)
    .maybeSingle()

  const { error: moduleError } = await service
    .from('business_modules')
    .upsert({
      business_id: params.id,
      module_key: moduleKey,
      enabled: nextEnabled,
      enabled_at: existingRow?.enabled_at ?? new Date().toISOString(),
      disabled_at: nextEnabled ? null : new Date().toISOString(),
      config: existingRow?.config ?? {},
    }, { onConflict: 'business_id,module_key' })

  if (moduleError) return NextResponse.json({ error: moduleError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
