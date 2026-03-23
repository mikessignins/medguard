import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PurgeLog from '@/components/admin/PurgeLog'

export default async function PurgeLogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('business_id, role')
    .eq('id', user.id)
    .single()

  if (!account || !['admin', 'superuser'].includes(account.role)) redirect('/login')

  const { data: logs } = await supabase
    .from('purge_audit_log')
    .select('*')
    .order('purged_at', { ascending: false })

  return <PurgeLog logs={logs ?? []} />
}
