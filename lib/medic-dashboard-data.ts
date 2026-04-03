import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  CONFIDENTIAL_MEDICATION_MODULE_KEY,
  FATIGUE_ASSESSMENT_MODULE_KEY,
  getConfiguredBusinessModules,
  type BusinessModule,
} from '@/lib/modules'
import type { FatigueAssessment } from '@/lib/types'

export interface MedicDashboardData {
  sites: Array<{ id: string; name: string; is_office: boolean }>
  submissions: Array<Record<string, unknown>>
  medDeclarations: Array<Record<string, unknown>>
  fatigueAssessments: FatigueAssessment[]
  medDecEnabled: boolean
  fatigueEnabled: boolean
}

export async function getMedicDashboardData(): Promise<MedicDashboardData> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, site_ids, business_id, contract_end_date')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'medic') redirect('/')

  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) {
    redirect('/expired')
  }

  const siteIds: string[] = account.site_ids || []
  const siteSelect = 'id,name,is_office'
  const submissionSelect =
    'id,business_id,site_id,worker_id,worker_snapshot,role,visit_date,shift_type,status,submitted_at,exported_at,phi_purged_at'
  const medDecSelect =
    'id,business_id,site_id,worker_name,submitted_at,medic_review_status,exported_at,phi_purged_at,medications,has_recent_injury_or_illness,has_side_effects'
  const fatigueSelect =
    'id,business_id,site_id,worker_id,module_key,module_version,status,payload,review_payload,submitted_at,reviewed_at,reviewed_by,exported_at,phi_purged_at'

  const [{ data: sites }, { data: submissions }, { data: businessModules }] = await Promise.all([
    supabase.from('sites').select(siteSelect).in('id', siteIds.length ? siteIds : ['__none__']),
    supabase
      .from('submissions')
      .select(submissionSelect)
      .in('site_id', siteIds.length ? siteIds : ['__none__'])
      .order('submitted_at', { ascending: false }),
    supabase
      .from('business_modules')
      .select('module_key, enabled')
      .eq('business_id', account.business_id),
  ])

  const configuredModules = getConfiguredBusinessModules((businessModules ?? []) as BusinessModule[], {
    surface: 'medic_queue',
  })
  const medDecEnabled = configuredModules.some(
    (module) => module.key === CONFIDENTIAL_MEDICATION_MODULE_KEY && module.enabled,
  )
  const fatigueEnabled = configuredModules.some(
    (module) => module.key === FATIGUE_ASSESSMENT_MODULE_KEY && module.enabled,
  )

  let medDeclarations: Array<Record<string, unknown>> = []
  if (medDecEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('medication_declarations')
      .select(medDecSelect)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    medDeclarations = data ?? []
  }

  let fatigueAssessments: FatigueAssessment[] = []
  if (fatigueEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('module_submissions')
      .select(fatigueSelect)
      .eq('module_key', FATIGUE_ASSESSMENT_MODULE_KEY)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    fatigueAssessments = (data as FatigueAssessment[] | null) ?? []
  }

  return {
    sites: sites ?? [],
    submissions: submissions ?? [],
    medDeclarations,
    fatigueAssessments,
    medDecEnabled,
    fatigueEnabled,
  }
}
