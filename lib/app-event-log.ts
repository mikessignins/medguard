import { createServiceClient } from '@/lib/supabase/service'

type AppEventResult = 'attempt' | 'success' | 'failure'
type AppEventSource = 'web_api' | 'web_client' | 'ios_app'

interface AppEventLogInput {
  source: AppEventSource
  action: string
  result: AppEventResult
  actorUserId?: string | null
  actorRole?: string | null
  actorName?: string | null
  businessId?: string | null
  moduleKey?: string | null
  route?: string | null
  targetId?: string | null
  errorMessage?: string | null
  context?: Record<string, unknown> | null
}

export async function safeLogServerEvent(event: AppEventLogInput) {
  try {
    const service = createServiceClient()
    const { error } = await service.from('app_event_log').insert({
      source: event.source,
      action: event.action,
      result: event.result,
      actor_user_id: event.actorUserId ?? null,
      actor_role: event.actorRole ?? null,
      actor_name: event.actorName ?? null,
      business_id: event.businessId ?? null,
      module_key: event.moduleKey ?? null,
      route: event.route ?? null,
      target_id: event.targetId ?? null,
      error_message: event.errorMessage ?? null,
      context: event.context ?? {},
    })

    if (error) {
      console.error('[app-event-log] insert error:', error)
    }
  } catch (error) {
    console.error('[app-event-log] unexpected error:', error)
  }
}
