import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MedicExportsDashboard from '@/components/medic/MedicExportsDashboard'

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

  const [{ data: sites }, { data: submissions }, { data: business }] = await Promise.all([
    supabase.from('sites').select('*').in('id', siteIds.length ? siteIds : ['__none__']),
    supabase.from('submissions').select('*').in('site_id', siteIds.length ? siteIds : ['__none__']).order('submitted_at', { ascending: false }),
    supabase.from('businesses').select('confidential_med_dec_enabled').eq('id', account.business_id).single(),
  ])

  const medDecEnabled = business?.confidential_med_dec_enabled ?? false

  let medDeclarations = null
  if (medDecEnabled && siteIds.length > 0) {
    const { data } = await supabase
      .from('medication_declarations')
      .select('*')
      .in('site_id', siteIds)
      .order('submitted_at', { ascending: false })
    medDeclarations = data
  }

  return (
    <MedicExportsDashboard
      sites={sites || []}
      submissions={submissions || []}
      medDeclarations={medDeclarations || []}
      initialSite={searchParams?.site}
    />
  )
}
