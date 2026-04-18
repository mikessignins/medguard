import { redirect } from 'next/navigation'
import { getRequestClient, getRequestUser, getRequestUserAccount, getRequestBusinessModules } from '@/lib/supabase/request-cache'
import {
  CONFIDENTIAL_MEDICATION_MODULE_KEY,
  FATIGUE_ASSESSMENT_MODULE_KEY,
  getConfiguredBusinessModules,
  type BusinessModule,
} from '@/lib/modules'
import { logRequestTiming, startRequestTimer } from '@/lib/request-timing'
import type { FatigueAssessment } from '@/lib/types'

export interface MedicDashboardData {
  sites: Array<{ id: string; name: string; is_office: boolean }>
  submissions: Array<Record<string, unknown>>
  medDeclarations: Array<Record<string, unknown>>
  fatigueAssessments: FatigueAssessment[]
  medDecEnabled: boolean
  fatigueEnabled: boolean
}

export type MedicDashboardModuleView = 'emergency' | 'medication' | 'fatigue'

export async function getMedicDashboardData(moduleView: MedicDashboardModuleView): Promise<MedicDashboardData> {
  const startedAt = startRequestTimer()
  // Cached: deduplicates with the layout's auth + account + modules queries
  // within the same server render — avoids triple-fetching on every tab change.
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account || account.role !== 'medic' || account.is_inactive) redirect('/')

  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) {
    redirect('/expired')
  }

  const businessModules = await getRequestBusinessModules(account.business_id)
  const supabase = await getRequestClient()

  const siteIds: string[] = account.site_ids || []
  const siteSelect = 'id,name,is_office'
  const submissionSelect =
    'id,business_id,site_id,worker_id,worker_snapshot,role,visit_date,shift_type,status,submitted_at,exported_at,phi_purged_at,is_test'
  const medDecSelect =
    'id,business_id,site_id,worker_name,submitted_at,medic_review_status,exported_at,phi_purged_at,medications,has_recent_injury_or_illness,has_side_effects,review_required,medical_officer_review_required,is_test'
  const fatigueSelect =
    'id,business_id,site_id,worker_id,module_key,module_version,status,payload,review_payload,submitted_at,reviewed_at,reviewed_by,exported_at,phi_purged_at,is_test'

  const [{ data: sites }, submissionsResult] = await Promise.all([
    supabase.from('sites').select(siteSelect).in('id', siteIds.length ? siteIds : ['__none__']),
    moduleView === 'emergency'
      ? supabase
          .from('submissions')
          .select(submissionSelect)
          .in('site_id', siteIds.length ? siteIds : ['__none__'])
          .order('submitted_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])
  const submissions = submissionsResult.data ?? []

  const configuredModules = getConfiguredBusinessModules(businessModules as BusinessModule[], {
    surface: 'medic_queue',
  })
  const medDecEnabled = configuredModules.some(
    (module) => module.key === CONFIDENTIAL_MEDICATION_MODULE_KEY && module.enabled,
  )
  const fatigueEnabled = configuredModules.some(
    (module) => module.key === FATIGUE_ASSESSMENT_MODULE_KEY && module.enabled,
  )

  let medDeclarations: Array<Record<string, unknown>> = []
  if (moduleView === 'medication' && medDecEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('medication_declarations')
      .select(medDecSelect)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    medDeclarations = data ?? []
  }

  let fatigueAssessments: FatigueAssessment[] = []
  if (moduleView === 'fatigue' && fatigueEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('module_submissions')
      .select(fatigueSelect)
      .eq('module_key', FATIGUE_ASSESSMENT_MODULE_KEY)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    fatigueAssessments = (data as FatigueAssessment[] | null) ?? []
  }

  await logRequestTiming('medic_dashboard_page_data', startedAt, {
    site_count: sites?.length ?? 0,
    submission_count: submissions?.length ?? 0,
    med_declaration_count: medDeclarations.length,
    fatigue_assessment_count: fatigueAssessments.length,
  })

  return {
    sites: sites ?? [],
    submissions: submissions ?? [],
    medDeclarations,
    fatigueAssessments,
    medDecEnabled,
    fatigueEnabled,
  }
}
