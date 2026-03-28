import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import ReminderIntervalPicker from '@/components/superuser/ReminderIntervalPicker'
import ModulesToggle from '@/components/superuser/ModulesToggle'
import LogoUpload from '@/components/superuser/LogoUpload'

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

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!business) notFound()

  const [{ data: admins }, { data: medics }, { data: sites }, { data: subStats }] = await Promise.all([
    supabase.from('user_accounts').select('id, display_name, email, contract_end_date').eq('business_id', params.id).eq('role', 'admin'),
    supabase.from('user_accounts').select('id, display_name, email, role, site_ids, contract_end_date').eq('business_id', params.id).in('role', ['medic', 'pending_medic']),
    supabase.from('sites').select('id, name, is_office, latitude, longitude').eq('business_id', params.id),
    supabase.from('submissions').select('status').eq('business_id', params.id),
  ])

  const statusCounts = (subStats || []).reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-800 text-white px-6 py-4 flex items-center gap-4 shadow">
        <Link href="/superuser" className="text-slate-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="text-xl font-bold">MedPass</span>
        <span className="text-slate-400 text-sm">|</span>
        <span className="text-slate-300 text-sm">Superuser</span>
        <span className="text-slate-500 text-sm">/</span>
        <span className="text-slate-300 text-sm">{business.name}</span>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Business header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{business.name}</h1>
              <p className="text-sm text-slate-500 mt-1">ID: {business.id}</p>
              {business.contact_email && (
                <p className="text-sm text-slate-500">{business.contact_email}</p>
              )}
            </div>
            {business.is_suspended && (
              <span className="text-sm bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-medium">
                Suspended
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
            {[
              { label: 'Total Declarations', value: subStats?.length || 0 },
              { label: 'New / Pending', value: (statusCounts['New'] || 0) + (statusCounts['In Review'] || 0) },
              { label: 'Approved', value: statusCounts['Approved'] || 0 },
              { label: 'Requires Follow-up', value: statusCounts['Requires Follow-up'] || 0 },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
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
        />

        {/* Admins */}
        <div>
          <h2 className="text-lg font-semibold text-slate-700 mb-3">
            Admins <span className="text-slate-400 font-normal text-sm">({admins?.length || 0})</span>
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {!admins || admins.length === 0 ? (
              <p className="px-5 py-4 text-slate-400 text-sm italic">No admins.</p>
            ) : (
              admins.map((a, i) => (
                <div key={a.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                  <p className="font-medium text-slate-800">{a.display_name}</p>
                  <p className="text-sm text-slate-500">{a.email}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Medics */}
        <div>
          <h2 className="text-lg font-semibold text-slate-700 mb-3">
            Medics <span className="text-slate-400 font-normal text-sm">({medics?.length || 0})</span>
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {!medics || medics.length === 0 ? (
              <p className="px-5 py-4 text-slate-400 text-sm italic">No medics.</p>
            ) : (
              medics.map((m, i) => (
                <div key={m.id} className={`px-5 py-4 flex items-center justify-between ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-800">{m.display_name}</p>
                      {m.role === 'pending_medic' && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pending</span>
                      )}
                      {m.contract_end_date && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Contractor</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{m.email}</p>
                    {m.contract_end_date && (
                      <p className="text-xs text-slate-400 mt-0.5">
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
          <h2 className="text-lg font-semibold text-slate-700 mb-3">
            Sites <span className="text-slate-400 font-normal text-sm">({sites?.length || 0})</span>
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {!sites || sites.length === 0 ? (
              <p className="px-5 py-4 text-slate-400 text-sm italic">No sites.</p>
            ) : (
              sites.map((s, i) => (
                <div key={s.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800">{s.name}</p>
                    {s.is_office && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Office</span>
                    )}
                  </div>
                  {s.latitude != null && s.longitude != null && (
                    <p className="text-xs text-slate-400 mt-0.5">
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
