import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminBilling from '@/components/admin/AdminBilling'

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

  // Billing counts use review status, not exported_at, so counts are immutable:
  // purging clears PHI but never changes review status, so counts only ever go up.
  const [{ data: submissions }, { data: medDecs }] = await Promise.all([
    supabase
      .from('submissions')
      .select('submitted_at, status')
      .eq('business_id', account.business_id)
      .in('status', ['In Review', 'Approved', 'Requires Follow-up'])
      .order('submitted_at', { ascending: false }),
    supabase
      .from('medication_declarations')
      .select('submitted_at, medic_review_status')
      .eq('business_id', account.business_id)
      .in('medic_review_status', ['In Review', 'Normal Duties', 'Restricted Duties', 'Unfit for Work'])
      .order('submitted_at', { ascending: false }),
  ])

  return <AdminBilling submissions={submissions ?? []} medDeclarations={medDecs ?? []} />
}
