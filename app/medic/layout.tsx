import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import SignOutButton from '@/components/SignOutButton'
import FeedbackButton from '@/components/FeedbackButton'
import ThemeToggle from '@/components/ThemeToggle'
import MedicNav from '@/components/medic/MedicNav'
import BusinessThemeLogo from '@/components/BusinessThemeLogo'

export default async function MedicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('display_name, role, business_id, contract_end_date')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'medic') redirect('/')

  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) {
    redirect('/expired')
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('name, logo_url, logo_url_light, logo_url_dark, is_suspended')
    .eq('id', account.business_id)
    .single()

  if (business?.is_suspended) redirect('/suspended')

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="no-print hidden md:flex flex-col w-64 min-h-screen bg-slate-950 border-r border-slate-800 shrink-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {business && (business.logo_url || business.logo_url_light || business.logo_url_dark) ? (
              <BusinessThemeLogo
                businessName={business.name ?? 'Business'}
                logoUrl={business.logo_url}
                logoUrlLight={business.logo_url_light}
                logoUrlDark={business.logo_url_dark}
              />
            ) : (
              <Image src="/medm8-icon.png" alt="MedPass" width={32} height={32} className="rounded-lg" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-slate-100 font-bold text-base leading-tight">MedPass</p>
              <p className="text-cyan-400 text-xs font-medium">Medic Portal</p>
            </div>
            <ThemeToggle compact />
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1">
          <MedicNav />
          <div className="pt-1">
            <FeedbackButton />
          </div>
        </div>

        {/* User section */}
        <div className="px-3 py-4 border-t border-slate-800 space-y-1">
          <div className="px-3 py-2">
            <p className="text-xs text-slate-500 mb-0.5">Signed in as</p>
            <p className="text-sm font-medium text-slate-300 truncate">{account.display_name}</p>
          </div>
          <Link
            href="/account"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all duration-150"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Account Settings
          </Link>
          <div className="px-3 py-2">
            <SignOutButton />
          </div>
          <div className="px-3 py-1">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto pb-20 md:pb-6">
        {children}
      </main>

      <MedicNav mobile />
    </div>
  )
}
