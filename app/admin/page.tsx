import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const METRIC_COLORS: Record<string, string> = {
  Workers: 'text-blue-400',
  'Active Medics': 'text-emerald-400',
  'Pending Medics': 'text-amber-400',
  Sites: 'text-violet-400',
  'Declarations This Month': 'text-cyan-400',
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-[var(--bg-card)] backdrop-blur-sm border border-[var(--border-md)] rounded-xl p-5">
      <p className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">{title}</p>
      <p className={`text-3xl font-bold ${METRIC_COLORS[title] ?? 'text-slate-100'}`}>{value}</p>
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
    supabase.from('user_accounts').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('role', 'worker'),
    supabase.from('user_accounts').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('role', 'medic'),
    supabase.from('user_accounts').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('role', 'pending_medic'),
    supabase.from('sites').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('business_id', businessId).gte('submitted_at', firstOfMonth),
  ])

  const metrics = [
    { title: 'Workers', value: workerCount ?? 0 },
    { title: 'Active Medics', value: medicCount ?? 0 },
    { title: 'Pending Medics', value: pendingCount ?? 0 },
    { title: 'Sites', value: siteCount ?? 0 },
    { title: 'Declarations This Month', value: submissionsThisMonth ?? 0 },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text-1)] mb-6">Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map(m => <MetricCard key={m.title} title={m.title} value={m.value} />)}
      </div>
    </div>
  )
}
