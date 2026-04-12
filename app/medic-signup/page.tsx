'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function MedicSignupPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/medic-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          email: email.trim(),
          password,
          invite_code: inviteCode.trim().toUpperCase(),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || 'Unable to request medic access.')
        return
      }

      setSuccess(payload.message || 'Medic sign-up complete. You can sign in with your password now, but access will stay pending until a business admin approves you.')
      setDisplayName('')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setInviteCode('')
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Medic sign-up</h1>
          <p className="mt-2 text-sm text-slate-400">
            Use the invite code from the business admin, then sign in with your own password while approval is pending.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-900/70 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Full name</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Invite code</label>
            <input
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-2.5 font-mono text-sm uppercase tracking-widest text-slate-100 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
              placeholder="ABC123"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
              placeholder="Re-enter password"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Sign up as medic'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/login" className="text-sm text-slate-500 transition-colors hover:text-cyan-400">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
