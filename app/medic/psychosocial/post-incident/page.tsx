import { redirect } from 'next/navigation'
import PostIncidentWelfareForm from '@/components/medic/PostIncidentWelfareForm'
import { getRequestClient, getRequestUser, getRequestUserAccount } from '@/lib/supabase/request-cache'

export default async function MedicPostIncidentWelfarePage({
  searchParams,
}: {
  searchParams: { site?: string }
}) {
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account || account.role !== 'medic') redirect('/')
  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) redirect('/expired')

  const supabase = await getRequestClient()
  const siteIds: string[] = account.site_ids || []
  const [{ data: sites }, { data: workers }] = await Promise.all([
    supabase
      .from('sites')
      .select('id,name')
      .in('id', siteIds.length ? siteIds : ['__none__'])
      .order('name', { ascending: true }),
    supabase
      .from('user_accounts')
      .select('id,display_name,site_ids')
      .eq('business_id', account.business_id)
      .eq('role', 'worker')
      .overlaps('site_ids', siteIds.length ? siteIds : ['__none__'])
      .order('display_name', { ascending: true }),
  ])

  return (
    <PostIncidentWelfareForm
      sites={sites || []}
      workers={workers || []}
      initialSite={searchParams.site}
    />
  )
}
