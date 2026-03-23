import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MedicDashboard from '@/components/medic/MedicDashboard'

export default async function MedicPage() {
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

  const [{ data: sites }, { data: submissions }] = await Promise.all([
    supabase.from('sites').select('*').in('id', siteIds.length ? siteIds : ['__none__']),
    supabase
      .from('submissions')
      .select('*')
      .in('site_id', siteIds.length ? siteIds : ['__none__'])
      .order('submitted_at', { ascending: false }),
  ])

  return <MedicDashboard sites={sites || []} submissions={submissions || []} />
}
