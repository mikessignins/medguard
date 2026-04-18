'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/surveillance', label: 'Overview' },
  { href: '/surveillance/compliance', label: 'Compliance' },
  { href: '/surveillance/workers', label: 'Workers' },
  { href: '/surveillance/queues/overdue', label: 'Queues' },
  { href: '/surveillance/appointments', label: 'Appointments' },
  { href: '/surveillance/escalations', label: 'Escalations' },
  { href: '/surveillance/notifications', label: 'Notifications' },
  { href: '/surveillance/providers', label: 'Providers' },
  { href: '/surveillance/reports', label: 'Reports' },
  { href: '/surveillance/programs', label: 'Catalogue' },
]

export default function SurveillanceSidebar() {
  const pathname = usePathname()

  return (
    <nav className="space-y-2">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === '/surveillance'
          ? pathname === item.href
          : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? 'surv-nav-link-active' : 'surv-nav-link'}
          >
            <span>{item.label}</span>
            {isActive ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--surv-accent)]" /> : null}
          </Link>
        )
      })}
    </nav>
  )
}
