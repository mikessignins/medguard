import { redirect } from 'next/navigation'
import MedicExportsDashboard from '@/components/medic/MedicExportsDashboard'
import {
  CONFIDENTIAL_MEDICATION_MODULE_KEY,
  FATIGUE_ASSESSMENT_MODULE_KEY,
  PSYCHOSOCIAL_HEALTH_MODULE_KEY,
  getConfiguredBusinessModules,
  type BusinessModule,
} from '@/lib/modules'
import { logRequestTiming, startRequestTimer } from '@/lib/request-timing'
import { getRequestBusinessModules, getRequestClient, getRequestUser, getRequestUserAccount } from '@/lib/supabase/request-cache'

export default async function MedicExportsPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const resolvedSearchParams = await searchParams
  const startedAt = startRequestTimer()
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account || account.role !== 'medic' || account.is_inactive) redirect('/')
  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) redirect('/expired')

  const supabase = await getRequestClient()
  const siteIds: string[] = account.site_ids || []
  const siteSelect = 'id,name,is_office'
  const submissionSelect = 'id,business_id,site_id,worker_snapshot,visit_date,shift_type,status,submitted_at,exported_at,phi_purged_at'
  const medDecSelect = 'id,business_id,site_id,worker_name,submitted_at,medic_review_status,exported_at,phi_purged_at,medications'
  const fatigueSelect = 'id,business_id,site_id,worker_id,module_key,module_version,status,payload,review_payload,submitted_at,reviewed_at,reviewed_by,exported_at,exported_by_name,phi_purged_at'
  const psychosocialSelect = 'id,business_id,site_id,worker_id,module_key,module_version,status,payload,review_payload,submitted_at,reviewed_at,reviewed_by,exported_at,exported_by_name,phi_purged_at,is_test'

  const [{ data: sites }, { data: submissions }, businessModules] = await Promise.all([
    supabase.from('sites').select(siteSelect).in('id', siteIds.length ? siteIds : ['__none__']),
    supabase.from('submissions').select(submissionSelect).in('site_id', siteIds.length ? siteIds : ['__none__']).order('submitted_at', { ascending: false }),
    getRequestBusinessModules(account.business_id),
  ])

  const configuredModules = getConfiguredBusinessModules((businessModules ?? []) as BusinessModule[], {
    surface: 'medic_exports',
  })
  const medDecEnabled = configuredModules.some((module) => module.key === CONFIDENTIAL_MEDICATION_MODULE_KEY && module.enabled)
  const fatigueEnabled = configuredModules.some((module) => module.key === FATIGUE_ASSESSMENT_MODULE_KEY && module.enabled)
  const psychosocialEnabled = configuredModules.some((module) => module.key === PSYCHOSOCIAL_HEALTH_MODULE_KEY && module.enabled)

  let medDeclarations = null
  if (medDecEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('medication_declarations')
      .select(medDecSelect)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    medDeclarations = data
  }

  let fatigueAssessments = null
  if (fatigueEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('module_submissions')
      .select(fatigueSelect)
      .eq('module_key', FATIGUE_ASSESSMENT_MODULE_KEY)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    fatigueAssessments = data
  }

  let psychosocialAssessments = null
  if (psychosocialEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('module_submissions')
      .select(psychosocialSelect)
      .eq('module_key', PSYCHOSOCIAL_HEALTH_MODULE_KEY)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    psychosocialAssessments = data
  }

  await logRequestTiming('medic_exports_page_data', startedAt, {
    site_count: sites?.length ?? 0,
    submission_count: submissions?.length ?? 0,
    med_declaration_count: medDeclarations?.length ?? 0,
    fatigue_assessment_count: fatigueAssessments?.length ?? 0,
    psychosocial_assessment_count: psychosocialAssessments?.length ?? 0,
  })

  return (
    <MedicExportsDashboard
      sites={sites || []}
      submissions={submissions || []}
      medDeclarations={medDeclarations || []}
      fatigueAssessments={fatigueAssessments || []}
      psychosocialAssessments={psychosocialAssessments || []}
      initialSite={resolvedSearchParams?.site}
    />
  )
}
