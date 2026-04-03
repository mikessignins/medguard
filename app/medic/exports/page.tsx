import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MedicExportsDashboard from '@/components/medic/MedicExportsDashboard'
import {
  CONFIDENTIAL_MEDICATION_MODULE_KEY,
  FATIGUE_ASSESSMENT_MODULE_KEY,
  getConfiguredBusinessModules,
  type BusinessModule,
} from '@/lib/modules'

export default async function MedicExportsPage({ searchParams }: { searchParams: { site?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('site_ids, business_id')
    .eq('id', user.id)
    .single()

  if (!account) redirect('/login')

  const siteIds: string[] = account.site_ids || []
  const siteSelect = 'id,name,is_office'
  const submissionSelect = 'id,business_id,site_id,worker_snapshot,visit_date,shift_type,status,submitted_at,exported_at,phi_purged_at'
  const medDecSelect = 'id,business_id,site_id,worker_name,submitted_at,medic_review_status,exported_at,phi_purged_at,medications'
  const fatigueSelect = 'id,business_id,site_id,worker_id,module_key,module_version,status,payload,review_payload,submitted_at,reviewed_at,reviewed_by,exported_at,exported_by_name,phi_purged_at'

  const [{ data: sites }, { data: submissions }, { data: businessModules }] = await Promise.all([
    supabase.from('sites').select(siteSelect).in('id', siteIds.length ? siteIds : ['__none__']),
    supabase.from('submissions').select(submissionSelect).in('site_id', siteIds.length ? siteIds : ['__none__']).order('submitted_at', { ascending: false }),
    supabase.from('business_modules').select('module_key, enabled').eq('business_id', account.business_id),
  ])

  const configuredModules = getConfiguredBusinessModules((businessModules ?? []) as BusinessModule[], {
    surface: 'medic_exports',
  })
  const medDecEnabled = configuredModules.some((module) => module.key === CONFIDENTIAL_MEDICATION_MODULE_KEY && module.enabled)
  const fatigueEnabled = configuredModules.some((module) => module.key === FATIGUE_ASSESSMENT_MODULE_KEY && module.enabled)

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

  return (
    <MedicExportsDashboard
      sites={sites || []}
      submissions={submissions || []}
      medDeclarations={medDeclarations || []}
      fatigueAssessments={fatigueAssessments || []}
      initialSite={searchParams?.site}
    />
  )
}
