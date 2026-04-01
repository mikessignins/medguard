import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import AdminSubmissions from '@/components/admin/AdminSubmissions'

export default async function AdminSubmissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, business_id')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'admin') redirect('/')

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: submissions }, { data: medDeclarations }, { data: sites }] = await Promise.all([
    service
      .from('submissions')
      .select('submitted_at, status, site_id')
      .eq('business_id', account.business_id)
      .neq('status', 'Recalled')
      .order('submitted_at', { ascending: false }),
    service
      .from('medication_declarations')
      .select('submitted_at, medic_review_status, site_id')
      .eq('business_id', account.business_id)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('sites')
      .select('id, name')
      .eq('business_id', account.business_id)
      .order('name', { ascending: true }),
  ])

  return (
    <AdminSubmissions
      submissions={submissions ?? []}
      medDeclarations={medDeclarations ?? []}
      sites={sites ?? []}
    />
  )
}
