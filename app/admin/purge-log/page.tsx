import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
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

  // Use service role to bypass RLS — scoped to this business via explicit filter
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: logs } = await service
    .from('purge_audit_log')
    .select('*')
    .eq('business_id', account.business_id)
    .order('purged_at', { ascending: false })

  return <PurgeLog logs={logs ?? []} />
}
