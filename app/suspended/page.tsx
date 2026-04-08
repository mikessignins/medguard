import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'

export default async function SuspendedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex items-center justify-center bg-teal-50">
      <div className="text-center max-w-md p-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Account Suspended</h1>
        <p className="text-slate-600 mb-2">
          Your organisation&apos;s MedGuard account has been suspended.
        </p>
        <p className="text-slate-500 text-sm mb-6">
          Please contact MedGuard support to resolve this.
        </p>
        <SignOutButton />
      </div>
    </div>
  )
}
