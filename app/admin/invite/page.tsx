import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InviteCodeManager from '@/components/admin/InviteCodeManager'

export default async function AdminInvitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('business_id')
    .eq('id', user.id)
    .single()

  if (!account) redirect('/login')

  const { data: inviteCode } = await supabase
    .from('invite_codes')
    .select('code')
    .eq('business_id', account.business_id)
    .single()

  return (
    <InviteCodeManager
      initialCode={inviteCode?.code ?? null}
      businessId={account.business_id}
    />
  )
}
