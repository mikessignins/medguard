import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminBilling from '@/components/admin/AdminBilling'
import { fetchBusinessMonthlyBillables } from '@/lib/billing'

export default async function AdminBillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, business_id')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'admin') redirect('/')

  const monthlyBillables = await fetchBusinessMonthlyBillables(account.business_id)

  return <AdminBilling monthlyBillables={monthlyBillables} />
}
