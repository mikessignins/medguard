import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SuperuserBilling from '@/components/superuser/SuperuserBilling'
import { fetchAllBillableRecords } from '@/lib/billing'

export default async function SuperuserBillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') redirect('/')

  const { businesses, submissions, medDeclarations } = await fetchAllBillableRecords()

  return (
    <SuperuserBilling
      businesses={businesses}
      submissions={submissions}
      medDeclarations={medDeclarations}
    />
  )
}
