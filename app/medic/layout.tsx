import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import SignOutButton from '@/components/SignOutButton'
import FeedbackButton from '@/components/FeedbackButton'
import ThemeToggle from '@/components/ThemeToggle'
import MedicNav from '@/components/medic/MedicNav'
import BusinessThemeLogo from '@/components/BusinessThemeLogo'
import { getConfiguredBusinessModules, type BusinessModule } from '@/lib/modules'
import { canAccessMedicPortal, resolveWebPortalDestination } from '@/lib/web-access'
import { getRequestBusiness, getRequestUser, getRequestUserAccount, getRequestBusinessModules } from '@/lib/supabase/request-cache'

export default async function MedicLayout({ children }: { children: React.ReactNode }) {
  // All three helpers are React cache() — deduplicated with any page-level calls
  // in the same render, so tab changes don't double-fetch auth or account data.
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account) redirect('/')

  const initialDestination = resolveWebPortalDestination({
    role: account.role,
    contractEndDate: account.contract_end_date,
    isSuspended: false,
  })

  if (!canAccessMedicPortal({
    role: account.role,
    contractEndDate: account.contract_end_date,
    isSuspended: false,
  })) {
    redirect(initialDestination ?? '/')
  }

  const [business, businessModules] = await Promise.all([
    getRequestBusiness(account.business_id),
    getRequestBusinessModules(account.business_id),
  ])

  const finalDestination = resolveWebPortalDestination({
    role: account.role,
    contractEndDate: account.contract_end_date,
    isSuspended: business?.is_suspended ?? false,
  })

  if (finalDestination !== '/medic') {
    redirect(finalDestination ?? '/')
  }

  const configuredModules = getConfiguredBusinessModules(businessModules as BusinessModule[], {
    surface: 'medic_queue',
  })

  return (
    <div className="medic-shell flex min-h-screen">
      {/* Sidebar */}
      <aside className="medic-sidebar no-print hidden min-h-screen w-72 shrink-0 flex-col border-r border-[var(--medic-border)] md:flex">
        {/* Logo */}
        <div className="border-b border-[var(--medic-border)] px-5 py-5">
          <div className="flex items-center gap-3">
            {business && (business.logo_url || business.logo_url_light || business.logo_url_dark) ? (
              <BusinessThemeLogo
                businessName={business.name ?? 'Business'}
                logoUrl={business.logo_url}
                logoUrlLight={business.logo_url_light}
                logoUrlDark={business.logo_url_dark}
              />
            ) : (
              <Image src="/medm8-icon.png" alt="MedGuard" width={32} height={32} className="rounded-lg" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold leading-tight text-[var(--medic-text)]">MedGuard</p>
              <p className="text-xs font-medium text-[var(--medic-accent-strong)]">Medic Operations</p>
              <p className="mt-1 truncate text-[11px] text-[var(--medic-muted)]">{business?.name || 'Assigned business'}</p>
            </div>
            <ThemeToggle compact />
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1">
          <MedicNav modules={configuredModules} />
          <div className="px-3 pt-1">
            <FeedbackButton />
          </div>
        </div>

        {/* User section */}
        <div className="space-y-1 border-t border-[var(--medic-border)] px-3 py-4">
          <div className="px-3 py-2">
            <p className="mb-0.5 text-xs text-[var(--medic-muted)]">Signed in as</p>
            <p className="truncate text-sm font-medium text-[var(--medic-text)]">{account.display_name}</p>
          </div>
          <Link
            href="/account"
            className="medic-nav-link"
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
      <main className="flex-1 overflow-auto p-5 pb-24 md:p-8 md:pb-8">
        {children}
      </main>

      <MedicNav modules={configuredModules} mobile />
    </div>
  )
}
