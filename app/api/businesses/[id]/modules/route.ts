import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isKnownModuleKey, MODULE_REGISTRY, type ModuleKey } from '@/lib/modules'
import { requireAuthenticatedUser, requireScopedBusinessAccess } from '@/lib/route-access'
import { parseBusinessIdParam, parseJsonBody } from '@/lib/api-validation'
import { logAndReturnInternalError, requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { z } from 'zod'

const businessModuleSchema = z.object({
  enabled: z.boolean(),
  moduleKey: z.string().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const parsedBusinessId = parseBusinessIdParam(resolvedParams.id)
  if (!parsedBusinessId.success) return parsedBusinessId.response

  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, display_name, business_id')
    .eq('id', userId)
    .single()

  const roleError = requireScopedBusinessAccess(account, parsedBusinessId.value)
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const parsed = await parseJsonBody(req, businessModuleSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

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

  const nextEnabled = body.enabled

  const { data: existingRow } = await supabase
    .from('business_modules')
    .select('config, enabled_at')
    .eq('business_id', parsedBusinessId.value)
    .eq('module_key', moduleKey)
    .maybeSingle()

  const { error: moduleError } = await supabase
    .from('business_modules')
    .upsert({
      business_id: parsedBusinessId.value,
      module_key: moduleKey,
      enabled: nextEnabled,
      enabled_at: existingRow?.enabled_at ?? new Date().toISOString(),
      disabled_at: nextEnabled ? null : new Date().toISOString(),
      config: existingRow?.config ?? {},
    }, { onConflict: 'business_id,module_key' })

  if (moduleError) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'business_module_updated',
      result: 'failure',
      actorUserId: userId,
      actorRole: account?.role,
      actorName: account?.display_name,
      businessId: parsedBusinessId.value,
      moduleKey,
      route: '/api/businesses/[id]/modules',
      targetId: parsedBusinessId.value,
      errorMessage: moduleError.message,
      context: { enabled: nextEnabled },
    })
    return logAndReturnInternalError('/api/businesses/[id]/modules', moduleError)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'business_module_updated',
    result: 'success',
    actorUserId: userId,
    actorRole: account?.role,
    actorName: account?.display_name,
    businessId: parsedBusinessId.value,
    moduleKey,
    route: '/api/businesses/[id]/modules',
    targetId: parsedBusinessId.value,
    context: { enabled: nextEnabled },
  })

  return NextResponse.json({ ok: true })
}
