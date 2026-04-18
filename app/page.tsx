import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = await searchParams
  const setupCode = typeof resolvedSearchParams.code === 'string' ? resolvedSearchParams.code : null
  const setup = typeof resolvedSearchParams.setup === 'string' ? resolvedSearchParams.setup : null

  if (setupCode) {
    redirect(`/account?setup=password&code=${encodeURIComponent(setupCode)}`)
  }

  if (setup === 'password') {
    redirect('/account?setup=password')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: account } = await service
    .from('user_accounts')
    .select('role, contract_end_date, is_inactive')
    .eq('id', user.id)
    .single()

  if (!account) redirect('/login')

  const { role, contract_end_date, is_inactive } = account

  if (contract_end_date && new Date(contract_end_date) < new Date()) {
    redirect('/expired')
  }

  if (is_inactive) redirect('/login')
  if (role === 'pending_medic') redirect('/pending')
  if (role === 'pending_occ_health') redirect('/pending')
  if (role === 'occ_health') redirect('/surveillance')
  if (role === 'medic') redirect('/medic/emergency')
  if (role === 'admin') redirect('/admin')
  if (role === 'superuser') redirect('/superuser')

  redirect('/login')
}
