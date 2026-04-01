'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  {
    href: '/medic',
    label: 'Queue',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/medic/exports',
    label: 'Exports',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V4m0 12l-4-4m4 4l4-4M4 18v1a2 2 0 002 2h12a2 2 0 002-2v-1" />
      </svg>
    ),
  },
]

function navClass(active: boolean) {
  return active
    ? 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 transition-all duration-150'
    : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all duration-150'
}

function mobileClass(active: boolean) {
  return active
    ? 'flex-1 flex flex-col items-center gap-1 py-3 text-cyan-400'
    : 'flex-1 flex flex-col items-center gap-1 py-3 text-slate-500'
}

export default function MedicNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()

  if (mobile) {
    return (
      <nav className="no-print flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950 border-t border-slate-800">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={mobileClass(pathname === item.href)}>
            <span className="w-5 h-5">{item.icon}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        ))}
        <Link href="/account" className={mobileClass(pathname === '/account')}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-xs font-medium">Account</span>
        </Link>
      </nav>
    )
  }

  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={navClass(pathname === item.href)}>
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
