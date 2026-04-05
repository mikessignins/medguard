'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { resolveWebPortalDestination } from '@/lib/web-access'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Login failed'); setLoading(false); return }

    const { data: account } = await supabase
      .from('user_accounts')
      .select('role, contract_end_date, business_id')
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
      isSuspended: business?.is_suspended ?? false,
    })

    if (destination) {
      router.push(destination)
      return
    }

    setError('This account type does not have web portal access.')
    setLoading(false)
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/account`,
    })
    setForgotLoading(false)
    if (error) {
      setError(error.message)
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
            <Image src="/medm8-icon.png" alt="MedPass" width={64} height={64} />
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">MedPass</h1>
        </div>

        {/* Card */}
        <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {!showForgot ? (
            <>
              <h2 className="text-slate-100 text-lg font-semibold mb-6">Sign in to your account</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
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
                  disabled={loading}
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
