'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignOutButton({ className = 'dashboard-nav-link w-full hover:text-red-400' }: { className?: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    if (typeof window !== 'undefined') {
      for (const storage of [window.sessionStorage, window.localStorage]) {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
          const key = storage.key(index)
          if (key?.startsWith('medic-submission-draft:')) {
            storage.removeItem(key)
          }
        }
      }
    }
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      className={className}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      Sign out
    </button>
  )
}
