'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getUserFacingErrorMessage } from '@/lib/user-facing-errors'

export default function AccountSettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [currentEmail, setCurrentEmail] = useState('')
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordCurrentPassword, setPasswordCurrentPassword] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [initialLoad, setInitialLoad] = useState(true)
  const [passwordSetupMode, setPasswordSetupMode] = useState(false)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const setupModeFromUrl =
      searchParams.get('setup') === 'password' ||
      searchParams.has('code') ||
      window.location.hash.includes('access_token=')
    setPasswordSetupMode(setupModeFromUrl)

    const { data: authListener } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordSetupMode(true)
      }
    })

    async function load() {
      const code = searchParams.get('code')
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (code) {
        const { data: existingSession } = await supabase.auth.getSession()
        if (existingSession.session) {
          await supabase.auth.signOut({ scope: 'local' })
        }

        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          console.error('[account/exchangeCodeForSession] failed', exchangeError)
          setError('This setup link is invalid or has expired. Ask for a new setup or password reset email.')
          setInitialLoad(false)
          return
        }

        window.history.replaceState({}, '', '/account?setup=password')
      } else if (accessToken && refreshToken) {
        const { data: existingSession } = await supabase.auth.getSession()
        if (existingSession.session) {
          await supabase.auth.signOut({ scope: 'local' })
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (sessionError) {
          console.error('[account/setSession] failed', sessionError)
          setError('This setup link is invalid or has expired. Ask for a new setup or password reset email.')
          setInitialLoad(false)
          return
        }

        window.history.replaceState({}, '', '/account?setup=password')
      } else if (setupModeFromUrl) {
        const { data: existingSession } = await supabase.auth.getSession()
        const expectedSetupUserId = sessionStorage.getItem('medguard:password-setup-user-id')
        if (expectedSetupUserId && existingSession.session?.user.id === expectedSetupUserId) {
          window.history.replaceState({}, '', '/account?setup=password')
        } else {
          if (existingSession.session) {
            await supabase.auth.signOut({ scope: 'local' })
          }

          setError('This setup link did not include a valid setup token. Ask for a new setup or password reset email, then open that link to choose a password.')
          setInitialLoad(false)
          return
        }
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(setupModeFromUrl ? '/login?setup=expired' : '/login')
        return
      }

      const { data: account, error: accountError } = await supabase
        .from('user_accounts')
        .select('display_name, email, role')
        .eq('id', user.id)
        .single()

      if (accountError) {
        console.error('[account/load] failed', accountError)
        setError(getUserFacingErrorMessage(accountError, 'We could not load your account settings. Please try again.'))
        setInitialLoad(false)
        return
      }

      if (account) {
        setDisplayName(account.display_name || '')
        setEmail(account.email || user.email || '')
        setCurrentEmail(account.email || user.email || '')
        setRole(account.role || '')
      }
      setInitialLoad(false)
    }
    load()
    return () => {
      authListener.subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearMessages() {
    setSuccess('')
    setError('')
  }

  async function updateName(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    const nextDisplayName = displayName.trim()
    if (!nextDisplayName) {
      setError('Enter the name you want shown in MedGuard.')
      return
    }
    setLoading('name')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(null)
      setError('Please sign in again to update your account.')
      return
    }

    const { error: err } = await supabase
      .from('user_accounts')
      .update({ display_name: nextDisplayName })
      .eq('id', user.id)

    setLoading(null)
    if (err) {
      console.error('[account/updateName] failed', err)
      setError(getUserFacingErrorMessage(err, 'We could not update your display name. Please try again.'))
      return
    }
    await supabase.auth.updateUser({ data: { display_name: nextDisplayName } })
    setDisplayName(nextDisplayName)
    setSuccess('Display name updated.')
    router.refresh()
  }

  async function updateEmail(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    if (!emailCurrentPassword) { setError('Enter your current password to update your email.'); return }
    setLoading('email')
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: emailCurrentPassword,
    })
    if (reauthError) {
      setLoading(null)
      setError('Current password is incorrect.')
      return
    }
    const { error: err } = await supabase.auth.updateUser({ email })
    setLoading(null)
    if (err) {
      console.error('[account/updateEmail] failed', err)
      setError(getUserFacingErrorMessage(err, 'We could not update your email address. Please try again.'))
      return
    }
    setEmailCurrentPassword('')
    setSuccess('Confirmation sent to your new email address.')
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!passwordSetupMode && !passwordCurrentPassword) {
      setError('Enter your current password to update your password.')
      return
    }
    setLoading('password')
    if (!passwordSetupMode) {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: passwordCurrentPassword,
      })
      if (reauthError) {
        setLoading(null)
        setError('Current password is incorrect.')
        return
      }
    }
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(null)
    if (err) {
      console.error('[account/updatePassword] failed', err)
      setError(getUserFacingErrorMessage(err, 'We could not update your password. Please try again.'))
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    setPasswordCurrentPassword('')
    setPasswordSetupMode(false)
    sessionStorage.removeItem('medguard:password-setup-user-id')
    setSuccess('Password updated. You can now sign in with this password.')
    router.replace('/account')
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

  if (!role && error) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-lg font-semibold text-red-200">Setup link problem</h1>
          <p className="mt-3 text-sm text-red-100">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="mt-5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
          >
            Go to sign in
          </button>
        </div>
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
            <input
              type="password"
              value={emailCurrentPassword}
              onChange={e => setEmailCurrentPassword(e.target.value)}
              required
              placeholder="Current password"
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
          <h2 className="text-base font-semibold text-slate-100 mb-2">
            {passwordSetupMode ? 'Set your password' : 'Password'}
          </h2>
          {passwordSetupMode && (
            <p className="mb-4 text-sm text-slate-400">
              Choose a password for this account. You do not need your old password when you arrive from a setup or reset email.
            </p>
          )}
          <form onSubmit={updatePassword} className="space-y-3">
            {!passwordSetupMode && (
              <input
                type="password"
                value={passwordCurrentPassword}
                onChange={e => setPasswordCurrentPassword(e.target.value)}
                required
                placeholder="Current password"
                className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
              />
            )}
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
              {loading === 'password' ? 'Saving...' : passwordSetupMode ? 'Set Password' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
