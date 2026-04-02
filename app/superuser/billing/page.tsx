import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SuperuserBilling from '@/components/superuser/SuperuserBilling'
import { fetchAllBusinessMonthlyBillables } from '@/lib/billing'

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

  const { businesses, monthlyBillables } = await fetchAllBusinessMonthlyBillables()

  return (
    <SuperuserBilling
      businesses={businesses}
      monthlyBillables={monthlyBillables}
    />
  )
}
