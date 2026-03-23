import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface MetricCardProps {
  title: string
  value: number
  icon: string
  color: string
}

function MetricCard({ title, value, icon, color }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-4">
      <div className={`text-3xl w-14 h-14 flex items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-3xl font-bold text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

export default async function AdminPage() {
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

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    { count: workerCount },
    { count: medicCount },
    { count: pendingCount },
    { count: siteCount },
    { count: submissionsThisMonth },
  ] = await Promise.all([
    supabase
      .from('user_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('role', 'worker'),
    supabase
      .from('user_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('role', 'medic'),
    supabase
      .from('user_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('role', 'pending_medic'),
    supabase
      .from('sites')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('submitted_at', firstOfMonth),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Workers"
          value={workerCount || 0}
          icon="&#128736;"
          color="bg-blue-50"
        />
        <MetricCard
          title="Active Medics"
          value={medicCount || 0}
          icon="&#129651;"
          color="bg-green-50"
        />
        <MetricCard
          title="Pending Medics"
          value={pendingCount || 0}
          icon="&#9203;"
          color="bg-yellow-50"
        />
        <MetricCard
          title="Sites"
          value={siteCount || 0}
          icon="&#127970;"
          color="bg-purple-50"
        />
        <MetricCard
          title="Declarations This Month"
          value={submissionsThisMonth || 0}
          icon="&#128203;"
          color="bg-slate-100"
        />
      </div>
    </div>
  )
}
