import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MedicDashboard from '@/components/medic/MedicDashboard'
import { CONFIDENTIAL_MEDICATION_MODULE_KEY, isBusinessModuleEnabled } from '@/lib/modules'

export default async function MedicPage({ searchParams }: { searchParams: { site?: string } }) {
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
  const submissionSelect = 'id,business_id,site_id,worker_id,worker_snapshot,role,visit_date,shift_type,status,submitted_at,exported_at,phi_purged_at'
  const medDecSelect = 'id,business_id,site_id,worker_name,submitted_at,medic_review_status,exported_at,phi_purged_at,medications,has_recent_injury_or_illness,has_side_effects'

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

  const medDecEnabled = isBusinessModuleEnabled(businessModules, CONFIDENTIAL_MEDICATION_MODULE_KEY)

  let medDeclarations = null
  if (medDecEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('medication_declarations')
      .select(medDecSelect)
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    medDeclarations = data
  }

  return (
    <MedicDashboard
      sites={sites || []}
      submissions={submissions || []}
      medDeclarations={medDeclarations || []}
      medDecEnabled={medDecEnabled}
      initialSite={searchParams?.site}
    />
  )
}
