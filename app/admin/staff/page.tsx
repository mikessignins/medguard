import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StaffManager from '@/components/admin/StaffManager'
import { expireMedicContracts } from '@/lib/admin-medics'

export default async function AdminStaffPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('business_id')
    .eq('id', user.id)
    .single()

  if (!account) redirect('/login')

  const businessId = account.business_id
  await expireMedicContracts(businessId)

  const [{ data: pendingMedics }, { data: activeMedics }, { data: inactiveMedics }, { data: sites }] = await Promise.all([
    supabase
      .from('user_accounts')
      .select('*')
      .eq('business_id', businessId)
      .eq('role', 'pending_medic'),
    supabase
      .from('user_accounts')
      .select('*')
      .eq('business_id', businessId)
      .eq('role', 'medic')
      .eq('is_inactive', false),
    supabase
      .from('user_accounts')
      .select('*')
      .eq('business_id', businessId)
      .eq('role', 'medic')
      .eq('is_inactive', true),
    supabase
      .from('sites')
      .select('*')
      .eq('business_id', businessId),
  ])

  return (
    <StaffManager
      pendingMedics={pendingMedics || []}
      activeMedics={activeMedics || []}
      inactiveMedics={inactiveMedics || []}
      sites={sites || []}
      businessId={businessId}
    />
  )
}
