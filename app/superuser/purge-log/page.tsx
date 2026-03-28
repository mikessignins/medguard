import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import PurgeLog from '@/components/admin/PurgeLog'

export default async function SuperuserPurgeLogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') redirect('/')

  // Use service role to bypass RLS — superuser sees all businesses
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: logs } = await service
    .from('purge_audit_log')
    .select('*')
    .order('purged_at', { ascending: false })

  return <PurgeLog logs={logs ?? []} showBusiness />
}
