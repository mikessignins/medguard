import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, contract_end_date')
    .eq('id', user.id)
    .single()

  if (!account) redirect('/login')

  const { role, contract_end_date } = account

  if (contract_end_date && new Date(contract_end_date) < new Date()) {
    redirect('/expired')
  }

  if (role === 'pending_medic') redirect('/pending')
  if (role === 'medic') redirect('/medic/emergency')
  if (role === 'admin') redirect('/admin')
  if (role === 'superuser') redirect('/superuser')

  redirect('/login')
}
