'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function AccountSettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: account } = await supabase
        .from('user_accounts')
        .select('display_name, email, role')
        .eq('id', user.id)
        .single()

      if (account) {
        setDisplayName(account.display_name || '')
        setEmail(account.email || user.email || '')
        setRole(account.role || '')
      }
      setInitialLoad(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearMessages() {
    setSuccess('')
    setError('')
  }

  async function updateName(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    setLoading('name')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: err } = await supabase
      .from('user_accounts')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id)

    setLoading(null)
    if (err) { setError(err.message); return }
    setSuccess('Display name updated.')
  }

  async function updateEmail(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    setLoading('email')
    const { error: err } = await supabase.auth.updateUser({ email })
    setLoading(null)
    if (err) { setError(err.message); return }
    setSuccess('Confirmation sent to your new email address.')
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading('password')
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(null)
    if (err) { setError(err.message); return }
    setNewPassword('')
    setConfirmPassword('')
    setSuccess('Password updated.')
  }

  function goBack() {
    if (role === 'medic') router.push('/medic')
    else if (role === 'admin') router.push('/admin')
    else if (role === 'superuser') router.push('/superuser')
    else router.push('/')
  }

  if (initialLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="bg-slate-950 border-b border-slate-800 text-white px-6 py-3 flex items-center gap-4">
        <button onClick={goBack} className="text-slate-400 hover:text-cyan-400 transition-colors duration-200">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Image src="/medm8-icon.png" alt="MedGuard" width={32} height={32} className="rounded-lg" />
        <span className="text-slate-100 font-bold text-xl">MedGuard</span>
        <span className="text-cyan-400 text-sm font-medium">Account Settings</span>
      </header>

      <div className="max-w-lg mx-auto p-6 space-y-6">
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-lg">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Display Name */}
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Display Name</h2>
          <form onSubmit={updateName} className="space-y-3">
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
              placeholder="Your name"
            />
            <button
              type="submit"
              disabled={loading === 'name'}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              {loading === 'name' ? 'Saving...' : 'Update Name'}
            </button>
          </form>
        </div>

        {/* Email */}
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Email Address</h2>
          <form onSubmit={updateEmail} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
            />
            <button
              type="submit"
              disabled={loading === 'email'}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              {loading === 'email' ? 'Saving...' : 'Update Email'}
            </button>
          </form>
        </div>

        {/* Password */}
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Password</h2>
          <form onSubmit={updatePassword} className="space-y-3">
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              placeholder="New password (min 8 characters)"
              className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm new password"
              className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
            />
            <button
              type="submit"
              disabled={loading === 'password'}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              {loading === 'password' ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
