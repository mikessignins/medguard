'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getUserFacingErrorMessage } from '@/lib/user-facing-errors'
import { resolveWebPortalDestination } from '@/lib/web-access'

function getLoginDestination(destination: string) {
  return destination === '/medic' ? '/medic/emergency' : destination
}

function getBackoffSeconds(failedAttempts: number) {
  if (failedAttempts < 3) return 0
  if (failedAttempts === 3) return 5
  if (failedAttempts === 4) return 30
  return 300
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)
  const lockoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const now = Date.now()
  const lockoutRemainingSeconds = lockoutUntil ? Math.max(0, Math.ceil((lockoutUntil - now) / 1000)) : 0
  const isLockedOut = lockoutRemainingSeconds > 0

  useEffect(() => {
    async function handleEmailLinkSession() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const linkType = hashParams.get('type')
      const isSetupLink = linkType === 'invite' || linkType === 'recovery'

      if (!accessToken || !refreshToken || !isSetupLink) return

      setSetupLoading(true)
      setError('')

      const { data: existingSession } = await supabase.auth.getSession()
      if (existingSession.session) {
        await supabase.auth.signOut({ scope: 'local' })
      }

      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError || !data.session?.user) {
        console.error('[login/setSessionFromEmailLink] failed', sessionError)
        window.history.replaceState({}, '', '/login')
        setError('This setup link is invalid or has expired. Ask for a new setup or password reset email.')
        setSetupLoading(false)
        return
      }

      sessionStorage.setItem('medguard:password-setup-user-id', data.session.user.id)
      router.replace('/account?setup=password')
    }

    handleEmailLinkSession()

    return () => {
      if (lockoutTimer.current) clearTimeout(lockoutTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()

    if (isLockedOut) {
      setError(`Too many failed sign-in attempts. Try again in ${lockoutRemainingSeconds} seconds.`)
      return
    }

    setLoading(true)
    setError('')

    const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError || !user) {
      const nextFailedAttempts = failedAttempts + 1
      const backoffSeconds = getBackoffSeconds(nextFailedAttempts)
      setFailedAttempts(nextFailedAttempts)
      if (backoffSeconds > 0) {
        const nextLockoutUntil = Date.now() + backoffSeconds * 1000
        setLockoutUntil(nextLockoutUntil)
        if (lockoutTimer.current) clearTimeout(lockoutTimer.current)
        lockoutTimer.current = setTimeout(() => setLockoutUntil(null), backoffSeconds * 1000)
        setError(`Too many failed sign-in attempts. Try again in ${backoffSeconds} seconds.`)
      } else {
        setError(getUserFacingErrorMessage(signInError, 'The email or password is incorrect.'))
      }
      setLoading(false)
      return
    }

    setFailedAttempts(0)
    setLockoutUntil(null)

    const { data: account } = await supabase
      .from('user_accounts')
      .select('role, contract_end_date, business_id, is_inactive')
      .eq('id', user.id)
      .single()

    if (!account) { setError('Account not found'); setLoading(false); return }

    const { data: business } = await supabase
      .from('businesses')
      .select('is_suspended')
      .eq('id', account.business_id)
      .single()

    const destination = resolveWebPortalDestination({
      role: account.role,
      contractEndDate: account.contract_end_date,
      isInactive: account.is_inactive ?? false,
      isSuspended: business?.is_suspended ?? false,
    })

    if (destination) {
      router.push(getLoginDestination(destination))
      return
    }

    setError('This account type does not have web portal access.')
    setLoading(false)
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/account?setup=password`,
    })
    setForgotLoading(false)
    if (error) {
      console.error('[login/resetPassword] failed', error)
      setError(getUserFacingErrorMessage(error, 'We could not send a password reset email. Please try again.'))
    } else {
      setForgotSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Ambient glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-slate-700/40 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 overflow-hidden shadow-lg shadow-cyan-500/20">
            <Image src="/medm8-icon.png" alt="MedGuard" width={64} height={64} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-1)]">MedGuard</h1>
        </div>

        {/* Card */}
        <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {!showForgot ? (
            <>
              <h2 className="text-slate-100 text-lg font-semibold mb-6">
                {setupLoading ? 'Opening setup link...' : 'Sign in to your account'}
              </h2>
              {setupLoading && (
                <div className="mb-4 bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-sm px-4 py-3 rounded-lg">
                  Preparing your password setup. This may take a moment.
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={setupLoading}
                  className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Password</label>
                  <input
                    type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={setupLoading}
                  className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
                  />
                </div>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || isLockedOut || setupLoading}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-lg shadow-cyan-600/20 mt-2"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
              <button
                onClick={() => { setShowForgot(true); setError(''); setForgotEmail(email) }}
                className="mt-4 w-full text-center text-sm text-slate-500 hover:text-cyan-400 transition-colors"
              >
                Forgot your password?
              </button>
              <div className="mt-5 border-t border-slate-700/60 pt-4 text-center">
                <p className="text-sm text-slate-500">Medic without an account?</p>
                <Link href="/medic-signup" className="mt-1 inline-block text-sm font-medium text-cyan-400 hover:text-cyan-300">
                  Request medic access
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-slate-100 text-lg font-semibold mb-2">Reset password</h2>
              <p className="text-sm text-slate-400 mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>
              {forgotSent ? (
                <div className="text-center space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-lg">
                    Reset link sent — check your email.
                  </div>
                  <button
                    onClick={() => { setShowForgot(false); setForgotSent(false) }}
                    className="text-sm text-slate-500 hover:text-cyan-400 transition-colors"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Email</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
                      placeholder="you@example.com"
                    />
                  </div>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {forgotLoading ? 'Sending...' : 'Send reset link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForgot(false); setError('') }}
                    className="w-full text-center text-sm text-slate-500 hover:text-cyan-400 transition-colors"
                  >
                    Back to sign in
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
