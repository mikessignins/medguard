import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { cookies, headers } from 'next/headers'
import SignOutButton from '@/components/SignOutButton'
import SuperuserSidebar from '@/components/superuser/SuperuserSidebar'
import FeedbackBadgeRefresher from '@/components/superuser/FeedbackBadgeRefresher'
import ThemeToggle from '@/components/ThemeToggle'

async function getUnreadFeedbackCount() {
  const headerStore = await headers()
  const cookieStore = await cookies()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')

  if (!host) return 0

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http'
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ')

  try {
    const response = await fetch(`${protocol}://${host}/api/superuser/feedback/unread-count`, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: 'no-store',
    })

    if (!response.ok) return 0

    const payload = (await response.json()) as { unread_count?: number }
    return payload.unread_count ?? 0
  } catch (error) {
    console.warn('[superuser/layout] unread feedback count fetch failed:', error)
    return 0
  }
}

export default async function SuperuserLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: account } = await service
    .from('user_accounts')
    .select('display_name, role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') redirect('/')

  const unreadFeedback = await getUnreadFeedbackCount()

  return (
    <div className="flex min-h-screen bg-[var(--bg-base)]">
      {/* Sidebar */}
      <aside className="dashboard-sidebar hidden w-64 shrink-0 flex-col border-r md:flex min-h-screen">
        {/* Logo */}
        <div className="dashboard-sidebar-logo border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <Image src="/medm8-icon.png" alt="MedGuard" width={32} height={32} className="rounded-lg" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold leading-tight text-[var(--text-1)]">MedGuard</p>
              <p className="text-cyan-400 text-xs font-medium">Superuser Portal</p>
            </div>
            <ThemeToggle compact />
          </div>
        </div>

        {/* Nav */}
        <SuperuserSidebar unreadFeedback={unreadFeedback} />

        {/* User section */}
        <div className="dashboard-sidebar-logo space-y-1 border-t px-3 py-4">
          <div className="px-3 py-2">
            <p className="mb-0.5 text-xs text-[var(--text-3)]">Signed in as</p>
            <p className="truncate text-sm font-medium text-[var(--text-2)]">{account.display_name}</p>
          </div>
          <Link
            href="/account"
            className="dashboard-nav-link"
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
      <nav className="dashboard-sidebar no-print fixed bottom-0 left-0 right-0 z-50 flex border-t md:hidden">
        <Link href="/superuser" className="flex-1 flex flex-col items-center gap-1 py-3 text-[var(--text-2)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span className="text-xs">Businesses</span>
        </Link>
        <Link href="/superuser/billing" className="flex-1 flex flex-col items-center gap-1 py-3 text-[var(--text-2)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="text-xs">Billing</span>
        </Link>
        <Link href="/superuser/reports" className="flex-1 flex flex-col items-center gap-1 py-3 text-[var(--text-2)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m5 5H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs">Reports</span>
        </Link>
        <Link href="/superuser/feedback" className="relative flex-1 flex flex-col items-center gap-1 py-3 text-[var(--text-2)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {unreadFeedback > 0 && (
            <span className="absolute top-2 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-amber-500" />
          )}
          <span className="text-xs">Feedback</span>
        </Link>
        <div className="flex-1 flex flex-col items-center gap-1 py-3 text-[var(--text-2)]">
          <SignOutButton />
        </div>
      </nav>
      <FeedbackBadgeRefresher />
    </div>
  )
}
