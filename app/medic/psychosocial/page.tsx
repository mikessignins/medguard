import { redirect } from 'next/navigation'
import PsychosocialDashboard from '@/components/medic/PsychosocialDashboard'
import {
  getConfiguredBusinessModules,
  PSYCHOSOCIAL_HEALTH_MODULE_KEY,
  type BusinessModule,
} from '@/lib/modules'
import { withPsychosocialWorkerNameFallback } from '@/lib/psychosocial'
import { logRequestTiming, startRequestTimer } from '@/lib/request-timing'
import { getRequestClient, getRequestUser, getRequestUserAccount, getRequestBusinessModules } from '@/lib/supabase/request-cache'
import type { PsychosocialAssessment } from '@/lib/types'
import { getWorkerDisplayNamesByIds } from '@/lib/worker-account-names'

function parsePsychosocialAssessment(raw: Record<string, unknown>): PsychosocialAssessment {
  return {
    id: String(raw.id ?? ''),
    business_id: String(raw.business_id ?? ''),
    site_id: String(raw.site_id ?? ''),
    worker_id: String(raw.worker_id ?? ''),
    module_key: 'psychosocial_health',
    module_version: Number(raw.module_version ?? 1),
    status: String(raw.status ?? 'awaiting_medic_review') as PsychosocialAssessment['status'],
    payload: raw.payload as PsychosocialAssessment['payload'],
    review_payload: (raw.review_payload as PsychosocialAssessment['review_payload']) ?? {},
    submitted_at: String(raw.submitted_at ?? ''),
    reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
    reviewed_by: raw.reviewed_by ? String(raw.reviewed_by) : null,
    exported_at: raw.exported_at ? String(raw.exported_at) : null,
    exported_by_name: raw.exported_by_name ? String(raw.exported_by_name) : null,
    phi_purged_at: raw.phi_purged_at ? String(raw.phi_purged_at) : null,
    is_test: typeof raw.is_test === 'boolean' ? raw.is_test : null,
  }
}

export default async function MedicPsychosocialDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const startedAt = startRequestTimer()
  // Cached helpers — deduplicated with layout's auth/account/modules queries
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account || account.role !== 'medic' || account.is_inactive) redirect('/')
  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) redirect('/expired')

  const siteIds: string[] = account.site_ids || []
  const supabase = await getRequestClient()

  const [{ data: sites }, businessModules] = await Promise.all([
    supabase.from('sites').select('id,name,is_office').in('id', siteIds.length ? siteIds : ['__none__']),
    getRequestBusinessModules(account.business_id),
  ])

  const configuredModules = getConfiguredBusinessModules(businessModules as BusinessModule[], {
    surface: 'medic_queue',
  })
  const psychosocialEnabled = configuredModules.some(
    (module) => module.key === PSYCHOSOCIAL_HEALTH_MODULE_KEY && module.enabled,
  )

  let supportCheckIns: PsychosocialAssessment[] = []
  let pulseCount = 0

  if (psychosocialEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('module_submissions')
      .select('*')
      .eq('module_key', PSYCHOSOCIAL_HEALTH_MODULE_KEY)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })

    const entries = ((data as Record<string, unknown>[] | null) ?? []).map(parsePsychosocialAssessment)
    const workerIds = Array.from(new Set(entries.map((entry) => entry.worker_id).filter(Boolean)))
    const workerNameById = await getWorkerDisplayNamesByIds(workerIds)
    const hydratedEntries = entries.map((entry) => withPsychosocialWorkerNameFallback(
      entry,
      workerNameById.get(entry.worker_id) ?? null,
    ))

    supportCheckIns = hydratedEntries.filter(
      (entry) => {
        const workflowKind = entry.payload?.workerPulse?.workflowKind
          ?? (entry.payload?.postIncidentWelfare ? 'post_incident_psychological_welfare' : null)
        return ['support_check_in', 'post_incident_psychological_welfare'].includes(workflowKind ?? '')
          && !entry.phi_purged_at
          && !entry.is_test
      },
    )
    pulseCount = hydratedEntries.filter(
      (entry) => entry.payload?.workerPulse?.workflowKind === 'wellbeing_pulse' && !entry.is_test,
    ).length
  }

  await logRequestTiming('medic_psychosocial_page_data', startedAt, {
    site_count: sites?.length ?? 0,
    support_check_in_count: supportCheckIns.length,
    pulse_count: pulseCount,
  })

  return (
    <PsychosocialDashboard
      sites={sites ?? []}
      supportCheckIns={supportCheckIns}
      pulseCount={pulseCount}
      initialSite={resolvedSearchParams?.site}
    />
  )
}
