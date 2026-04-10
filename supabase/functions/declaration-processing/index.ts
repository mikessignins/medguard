import { createClient } from 'jsr:@supabase/supabase-js@2'

type DeclarationProcessingPayload = {
  moduleKey: string
  route: string
  targetId: string
  targetTable: 'submissions' | 'medication_declarations' | 'module_submissions'
  businessId: string
  siteId?: string | null
  triggeredByUserId: string
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const payload = (await request.json()) as DeclarationProcessingPayload
  const now = new Date().toISOString()

  const { error: fetchError } = await supabase
    .from(payload.targetTable)
    .select('id')
    .eq('id', payload.targetId)
    .limit(1)
    .single()

  await supabase.from('app_event_log').insert({
    source: 'supabase_edge_function',
    action: 'declaration_background_processing',
    result: fetchError ? 'failure' : 'success',
    actor_user_id: payload.triggeredByUserId,
    actor_role: 'medic',
    actor_name: 'Declaration processing worker',
    business_id: payload.businessId,
    module_key: payload.moduleKey,
    route: payload.route,
    target_id: payload.targetId,
    context: {
      site_id: payload.siteId ?? null,
      target_table: payload.targetTable,
      processed_at: now,
    },
    error_message: fetchError?.message ?? null,
  })

  return Response.json({ ok: true, processedAt: now })
})
