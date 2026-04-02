import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import ReminderIntervalPicker from '@/components/superuser/ReminderIntervalPicker'
import ModulesToggle from '@/components/superuser/ModulesToggle'
import LogoUpload from '@/components/superuser/LogoUpload'
import TrialPeriodManager from '@/components/superuser/TrialPeriodManager'
import IsTestOverride from '@/components/superuser/IsTestOverride'
import AdminManager from '@/components/superuser/AdminManager'

export default async function BusinessDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') redirect('/')

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: business } = await service
    .from('businesses')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!business) notFound()

  const [{ data: admins }, { data: medics }, { data: sites }, { data: subStats }, { data: newSubmissions }] = await Promise.all([
    service.from('user_accounts').select('id, display_name, email, contract_end_date').eq('business_id', params.id).eq('role', 'admin'),
    service.from('user_accounts').select('id, display_name, email, role, site_ids, contract_end_date').eq('business_id', params.id).in('role', ['medic', 'pending_medic']),
    service.from('sites').select('id, name, is_office, latitude, longitude').eq('business_id', params.id),
    service.from('submissions').select('status').eq('business_id', params.id),
    // Non-PHI fields only — superusers never see worker_snapshot
    service.from('submissions')
      .select('id, submitted_at, site_name, is_test')
      .eq('business_id', params.id)
      .eq('status', 'New')
      .order('submitted_at', { ascending: false }),
  ])

  const statusCounts = (subStats || []).reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--border-md)] bg-[var(--bg-surface)] px-6 py-4 shadow-sm">
        <Link href="/superuser" className="text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="text-xl font-bold text-[var(--text-1)]">MedPass</span>
        <span className="text-sm text-[var(--text-3)]">|</span>
        <span className="text-sm text-[var(--text-2)]">Superuser</span>
        <span className="text-sm text-[var(--text-3)]">/</span>
        <span className="text-sm text-[var(--text-2)]">{business.name}</span>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Business header */}
        <div className="rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-1)]">{business.name}</h1>
              <p className="mt-1 text-sm text-[var(--text-2)]">ID: {business.id}</p>
              {business.contact_email && (
                <p className="text-sm text-[var(--text-2)]">{business.contact_email}</p>
              )}
            </div>
            {business.is_suspended && (
              <span className="text-sm bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-medium">
                Suspended
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-6 sm:grid-cols-4">
            {[
              { label: 'Total Declarations', value: subStats?.length || 0 },
              { label: 'New / Pending', value: (statusCounts['New'] || 0) + (statusCounts['In Review'] || 0) },
              { label: 'Approved', value: statusCounts['Approved'] || 0 },
              { label: 'Requires Follow-up', value: statusCounts['Requires Follow-up'] || 0 },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-[var(--text-1)]">{stat.value}</p>
                <p className="mt-0.5 text-xs text-[var(--text-2)]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Declaration Reminders */}
        <ReminderIntervalPicker
          businessId={business.id}
          initialMonths={business.reminder_interval_months ?? 3}
        />

        {/* Modules */}
        <ModulesToggle
          businessId={business.id}
          initialEnabled={business.confidential_med_dec_enabled ?? false}
        />

        {/* Business Logo */}
        <LogoUpload
          businessId={business.id}
          currentLogoUrl={business.logo_url}
          currentLogoLightUrl={business.logo_url_light}
          currentLogoDarkUrl={business.logo_url_dark}
        />

        {/* Trial period — controls auto-tagging of new submissions as test forms */}
        <TrialPeriodManager
          businessId={business.id}
          initialTrialUntil={business.trial_until ?? null}
        />

        {/* Manual is_test override — only shows when there are 'New' submissions */}
        <IsTestOverride
          initialSubmissions={newSubmissions ?? []}
        />

        <AdminManager businessId={business.id} initialAdmins={admins ?? []} />

        {/* Medics */}
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-1)]">
            Medics <span className="text-sm font-normal text-[var(--text-3)]">({medics?.length || 0})</span>
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)]">
            {!medics || medics.length === 0 ? (
              <p className="px-5 py-4 text-sm italic text-[var(--text-3)]">No medics.</p>
            ) : (
              medics.map((m, i) => (
                <div key={m.id} className={`flex items-center justify-between px-5 py-4 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--text-1)]">{m.display_name}</p>
                      {m.role === 'pending_medic' && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pending</span>
                      )}
                      {m.contract_end_date && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Contractor</span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-2)]">{m.email}</p>
                    {m.contract_end_date && (
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">
                        Contract ends: {format(new Date(m.contract_end_date), 'dd MMM yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sites */}
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-1)]">
            Sites <span className="text-sm font-normal text-[var(--text-3)]">({sites?.length || 0})</span>
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)]">
            {!sites || sites.length === 0 ? (
              <p className="px-5 py-4 text-sm italic text-[var(--text-3)]">No sites.</p>
            ) : (
              sites.map((s, i) => (
                <div key={s.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--text-1)]">{s.name}</p>
                    {s.is_office && (
                      <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-xs text-[var(--text-2)]">Office</span>
                    )}
                  </div>
                  {s.latitude != null && s.longitude != null && (
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">
                      {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
