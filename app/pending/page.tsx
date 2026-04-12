import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'

export default async function PendingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex items-center justify-center bg-teal-50">
      <div className="text-center max-w-md p-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="text-5xl mb-4">&#9203;</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Awaiting Approval</h1>
        <p className="text-slate-600 mb-6">
          Your account is pending approval from a business admin. You can sign in again after they approve your access.
        </p>
        <SignOutButton />
      </div>
    </div>
  )
}
