import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

function MetricCard({ title, value, color, alert }: { title: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className={`bg-[var(--bg-card)] backdrop-blur-sm border rounded-xl p-5 ${
      alert && value > 0 ? 'border-red-500/40 bg-red-500/5' : 'border-[var(--border-md)]'
    }`}>
      <p className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">{title}</p>
      <p className={`text-3xl font-bold ${alert && value > 0 ? 'text-red-400' : color}`}>{value}</p>
      {alert && value > 0 && (
        <p className="text-xs text-red-400 mt-1">Review required — safety risk</p>
      )}
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
  const currentMonthKey = firstOfMonth.slice(0, 10)
  // Forms unreviewed for more than 24 hours are a safety risk
  const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [
    { count: workerCount },
    { count: medicCount },
    { count: pendingCount },
    { count: siteCount },
    { data: thisMonthBillingRow },
    { count: staleForms },
    { data: cronHealth },
  ] = await Promise.all([
    supabase.from('user_accounts').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('role', 'worker'),
    supabase.from('user_accounts').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('role', 'medic'),
    supabase.from('user_accounts').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('role', 'pending_medic'),
    supabase.from('sites').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
    service
      .from('business_monthly_billables')
      .select('billable_forms')
      .eq('business_id', businessId)
      .eq('bill_month', currentMonthKey)
      .maybeSingle(),
    // Count forms stuck in New or In Review for > 24 hours (unexported, not recalled)
    service
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .in('status', ['New', 'In Review'])
      .is('exported_at', null)
      .lt('submitted_at', staleThreshold),
    service
      .from('cron_health_log')
      .select('last_run_at, last_result')
      .eq('cron_name', 'purge-exports')
      .single(),
  ])

  const submissionsThisMonth = Number(thisMonthBillingRow?.billable_forms ?? 0)

  const metrics = [
    { title: 'Workers', value: workerCount ?? 0, color: 'text-blue-400', alert: false },
    { title: 'Active Medics', value: medicCount ?? 0, color: 'text-emerald-400', alert: false },
    { title: 'Pending Medics', value: pendingCount ?? 0, color: 'text-amber-400', alert: false },
    { title: 'Sites', value: siteCount ?? 0, color: 'text-violet-400', alert: false },
    { title: 'Declarations This Month', value: submissionsThisMonth, color: 'text-cyan-400', alert: false },
    { title: 'Unreviewed >24h', value: staleForms ?? 0, color: 'text-slate-400', alert: true },
  ]

  // Warn if the auto-purge cron hasn't run in > 25 hours
  const cronLastRun = cronHealth?.last_run_at ? new Date(cronHealth.last_run_at) : null
  const cronStale = cronLastRun
    ? now.getTime() - cronLastRun.getTime() > 25 * 60 * 60 * 1000
    : true

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text-1)] mb-6">Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map(m => (
          <MetricCard key={m.title} title={m.title} value={m.value} color={m.color} alert={m.alert} />
        ))}
      </div>

      {/* Auto-purge cron health */}
      <div className={`mt-6 flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
        cronStale
          ? 'bg-red-500/5 border-red-500/30 text-red-400'
          : 'bg-slate-800/40 border-slate-700/50 text-slate-500'
      }`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${cronStale ? 'bg-red-400' : 'bg-emerald-400'}`} />
        {cronStale ? (
          <span>
            <span className="font-medium text-red-300">Auto-purge not running.</span>
            {' '}Last run: {cronLastRun
              ? formatDistanceToNow(cronLastRun, { addSuffix: true })
              : 'never'
            }. Contact your system administrator.
          </span>
        ) : (
          <span>
            Auto-purge healthy — last ran {formatDistanceToNow(cronLastRun!, { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  )
}
