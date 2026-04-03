import { redirect } from 'next/navigation'
import PostIncidentWelfareForm from '@/components/medic/PostIncidentWelfareForm'
import { createClient } from '@/lib/supabase/server'

export default async function MedicPostIncidentWelfarePage({
  searchParams,
}: {
  searchParams: { site?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, site_ids, contract_end_date')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'medic') redirect('/')
  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) redirect('/expired')

  const siteIds: string[] = account.site_ids || []
  const { data: sites } = await supabase
    .from('sites')
    .select('id,name')
    .in('id', siteIds.length ? siteIds : ['__none__'])
    .order('name', { ascending: true })

  return <PostIncidentWelfareForm sites={sites || []} initialSite={searchParams.site} />
}
