'use client'
import { usePathname, useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Overview', href: '/admin' },
  { label: 'Staff', href: '/admin/staff' },
  { label: 'Sites', href: '/admin/sites' },
  { label: 'Invite Code', href: '/admin/invite' },
]

export default function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav className="bg-white border-b border-slate-200 px-6">
      <div className="max-w-7xl mx-auto flex gap-1">
        {NAV_ITEMS.map(item => {
          const isActive = item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href)
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-slate-800 text-slate-800'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
