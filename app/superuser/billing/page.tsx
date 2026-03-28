import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import SuperuserBilling from '@/components/superuser/SuperuserBilling'

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

  // Use service role to bypass RLS — superuser sees all businesses
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: businesses }, { data: submissions }, { data: medDecs }] = await Promise.all([
    service.from('businesses').select('id, name').order('name'),
    service
      .from('submissions')
      .select('business_id, submitted_at, status')
      .in('status', ['In Review', 'Approved', 'Requires Follow-up'])
      .order('submitted_at', { ascending: false }),
    service
      .from('medication_declarations')
      .select('business_id, submitted_at, medic_review_status')
      .in('medic_review_status', ['Normal Duties', 'Restricted Duties', 'Unfit for Work'])
      .order('submitted_at', { ascending: false }),
  ])

  return (
    <SuperuserBilling
      businesses={businesses ?? []}
      submissions={submissions ?? []}
      medDeclarations={medDecs ?? []}
    />
  )
}
