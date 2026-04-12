import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import SuperuserDashboard from '@/components/superuser/SuperuserDashboard'
import type { Business } from '@/lib/types'

interface BusinessRow extends Business {
  adminCount: number
  adminNames: string[]
  medicCount: number
  workerCount: number
  siteCount: number
  totalDeclarations: number
  lastDeclaration: string | null
  is_suspended: boolean
}

export default async function SuperuserPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, business_id, superuser_scope')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') redirect('/')

  const service = createServiceClient()

  const { data: businesses } = await service
    .from('businesses')
    .select('*')
    .order('name')

  const { data: allUsers } = await service
    .from('user_accounts')
    .select('business_id, role, display_name')

  const { data: allSites } = await service
    .from('sites')
    .select('business_id')

  const { data: allSubmissions } = await service
    .from('submissions')
    .select('business_id, submitted_at')
    .order('submitted_at', { ascending: false })

  const businessRows: BusinessRow[] = (businesses || []).map(biz => {
    const bizUsers = (allUsers || []).filter(u => u.business_id === biz.id)
    const bizSites = (allSites || []).filter(s => s.business_id === biz.id)
    const bizSubs = (allSubmissions || []).filter(s => s.business_id === biz.id)

    return {
      ...biz,
      adminCount: bizUsers.filter(u => u.role === 'admin').length,
      adminNames: bizUsers.filter(u => u.role === 'admin').map(u => u.display_name).filter(Boolean),
      medicCount: bizUsers.filter(u => u.role === 'medic').length,
      workerCount: bizUsers.filter(u => u.role === 'worker').length,
      siteCount: bizSites.length,
      totalDeclarations: bizSubs.length,
      lastDeclaration: bizSubs[0]?.submitted_at || null,
      is_suspended: biz.is_suspended ?? false,
    }
  })

  return <SuperuserDashboard businesses={businessRows} />
}
