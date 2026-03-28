import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'

export default async function ExpiredPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex items-center justify-center bg-teal-50">
      <div className="text-center max-w-md p-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="text-5xl mb-4">&#128274;</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Contract Expired</h1>
        <p className="text-slate-600 mb-6">
          Your contract has expired and your access to MedPass has been revoked. Please contact your administrator to renew your contract.
        </p>
        <SignOutButton />
      </div>
    </div>
  )
}
