import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import AdminSidebar from '@/components/admin/AdminSidebar'
import SignOutButton from '@/components/SignOutButton'
import ThemeToggle from '@/components/ThemeToggle'
import BusinessThemeLogo from '@/components/BusinessThemeLogo'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('display_name, role, business_id')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'admin') redirect('/')

  const { data: business } = await supabase
    .from('businesses')
    .select('name, logo_url, logo_url_light, logo_url_dark, is_suspended')
    .eq('id', account.business_id)
    .single()

  if (business?.is_suspended) redirect('/suspended')

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 min-h-screen bg-slate-950 border-r border-slate-800 shrink-0">
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
              <p className="text-cyan-400 text-xs font-medium">Admin Portal</p>
            </div>
            <ThemeToggle compact />
          </div>
        </div>

        {/* Nav */}
        <AdminSidebar />

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

      {/* Mobile bottom nav */}
      <nav className="no-print flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950 border-t border-slate-800">
        <Link href="/admin" className="flex-1 flex flex-col items-center gap-1 py-3 text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span className="text-xs">Overview</span>
        </Link>
        <Link href="/admin/staff" className="flex-1 flex flex-col items-center gap-1 py-3 text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs">Staff</span>
        </Link>
        <Link href="/admin/submissions" className="flex-1 flex flex-col items-center gap-1 py-3 text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs">Submissions</span>
        </Link>
        <Link href="/admin/sites" className="flex-1 flex flex-col items-center gap-1 py-3 text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs">Sites</span>
        </Link>
        <Link href="/account" className="flex-1 flex flex-col items-center gap-1 py-3 text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-xs">Account</span>
        </Link>
      </nav>
    </div>
  )
}
