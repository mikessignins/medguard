'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import FeedbackButton from '@/components/FeedbackButton'

interface NavItem {
  label: string
  href: string
  exact: boolean
  icon: React.ReactNode
  badge?: number
}

const NAV_ITEMS: Omit<NavItem, 'badge'>[] = [
  {
    label: 'Businesses',
    href: '/superuser',
    exact: true,
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Reports',
    href: '/superuser/reports',
    exact: false,
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m5 5H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: 'Purge Log',
    href: '/superuser/purge-log',
    exact: false,
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: 'Billing',
    href: '/superuser/billing',
    exact: false,
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Feedback',
    href: '/superuser/feedback',
    exact: false,
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
]

interface Props {
  unreadFeedback: number
}

export default function SuperuserSidebar({ unreadFeedback }: Props) {
  const pathname = usePathname()
  const items: NavItem[] = NAV_ITEMS.map(item =>
    item.href === '/superuser/feedback'
      ? { ...item, badge: unreadFeedback > 0 ? unreadFeedback : undefined }
      : item
  )

  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {items.map(item => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive
              ? 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 transition-all duration-150'
              : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all duration-150'
            }
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.badge !== undefined && (
              <span className="text-xs font-semibold bg-amber-500 text-slate-900 rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1.5">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </Link>
        )
      })}
      <div className="pt-1">
        <FeedbackButton />
      </div>
    </nav>
  )
}
