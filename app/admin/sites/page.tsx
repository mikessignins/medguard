import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SitesManager from '@/components/admin/SitesManager'

export default async function AdminSitesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('business_id')
    .eq('id', user.id)
    .single()

  if (!account) redirect('/login')

  const { data: sites } = await supabase
    .from('sites')
    .select('*')
    .eq('business_id', account.business_id)
    .order('name')

  return <SitesManager sites={sites || []} businessId={account.business_id} />
}
