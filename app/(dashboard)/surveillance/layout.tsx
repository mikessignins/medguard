import { redirect } from 'next/navigation'
import Link from 'next/link'
import BusinessThemeLogo from '@/components/BusinessThemeLogo'
import FeedbackButton from '@/components/FeedbackButton'
import SignOutButton from '@/components/SignOutButton'
import ThemeToggle from '@/components/ThemeToggle'
import SurveillanceSidebar from '@/components/surveillance/SurveillanceSidebar'
import { getSurveillanceContext } from '@/lib/surveillance/queries'

export const dynamic = 'force-dynamic'

export default async function SurveillanceLayout({ children }: { children: React.ReactNode }) {
  let context = null

  try {
    context = await getSurveillanceContext()
  } catch (error) {
    console.error('[surveillance/layout] failed to load context', error)
  }

  if (!context) redirect('/')
  if (!context.moduleEnabled) redirect('/admin')
  if (context.business?.is_suspended) redirect('/suspended')

  const businessName = context.business?.name?.trim() || 'MedGuard'
  const hasBusinessLogo = Boolean(context.business?.logo_url || context.business?.logo_url_light || context.business?.logo_url_dark)

  return (
    <div className="surv-shell">
      <div className="surv-frame">
        <aside className="surv-sidebar">
          <div className="surv-sidebar-section">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="surv-kicker">Occ Health</p>
                <ThemeToggle
                  compact
                  compactClassName="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--surv-border)] bg-[var(--surv-card)] text-[var(--surv-muted)] transition hover:bg-[var(--surv-accent-soft)] hover:text-[var(--surv-text)]"
                />
              </div>
              <div className="rounded-lg border border-[var(--surv-border)] bg-[var(--surv-card)] p-3">
                <div className="flex min-h-24 items-center justify-center overflow-hidden rounded-md bg-[var(--surv-panel-soft)] p-3">
                  {hasBusinessLogo && context.business ? (
                    <BusinessThemeLogo
                      businessName={businessName}
                      logoUrl={context.business.logo_url}
                      logoUrlLight={context.business.logo_url_light}
                      logoUrlDark={context.business.logo_url_dark}
                      className="max-h-16 w-full max-w-full rounded-md object-contain"
                    />
                  ) : (
                    <p className="break-words text-center text-xl font-semibold leading-tight text-[var(--surv-text)]">{businessName}</p>
                  )}
                </div>
                <p className="mt-3 text-xs font-medium text-[var(--surv-muted)]">MedGuard workspace</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex-1">
            <SurveillanceSidebar />
          </div>

          <div className="surv-sidebar-section mt-4 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--surv-muted)]">Signed in</p>
              <p className="mt-2 truncate text-sm font-medium text-[var(--surv-text)]">{context.account.display_name}</p>
            </div>
            <Link href="/account" className="surv-nav-link">
              <span>Account Settings</span>
            </Link>
            <FeedbackButton className="surv-nav-link w-full justify-start text-left" />
            <div>
              <SignOutButton className="surv-nav-link w-full text-left hover:text-[var(--surv-text)]" />
            </div>
          </div>
        </aside>

        <main className="surv-main">
          {children}
        </main>
      </div>
    </div>
  )
}
