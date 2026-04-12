'use client'
import { useState } from 'react'
import type { Business } from '@/lib/types'

interface BusinessRow extends Business {
  adminCount: number
  adminNames: string[]
  medicCount: number
  workerCount: number
  siteCount: number
  totalDeclarations: number
  lastDeclaration: string | null
  is_suspended: boolean
}

interface Props {
  onClose: () => void
  onSuccess: (biz: BusinessRow) => void
}

export default function NewBusinessModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    business_id: '',
    business_name: '',
    contact_email: '',
    admin_display_name: '',
    admin_email: '',
    temporary_password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)

  function generateTemporaryPassword(length = 14) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_'
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, byte => chars[byte % chars.length]).join('')
  }

  function handleChange(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const response = await fetch('/api/superuser/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: form.business_id,
        business_name: form.business_name,
        contact_email: form.contact_email,
        admin_display_name: form.admin_display_name,
        admin_email: form.admin_email,
        temporary_password: form.temporary_password,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error || 'Failed to create business')
      setLoading(false)
      return
    }

    if (data?.invite_code) {
      setInviteCode(data.invite_code)
    }
    if (data?.temporary_password) {
      setTemporaryPassword(data.temporary_password)
    }

    const newBiz: BusinessRow = {
      id: form.business_id,
      name: form.business_name,
      contact_email: form.contact_email,
      adminCount: 1,
      adminNames: [form.admin_display_name],
      medicCount: 0,
      workerCount: 0,
      siteCount: 0,
      totalDeclarations: 0,
      lastDeclaration: null,
      is_suspended: false,
    }

    onSuccess(newBiz)
    setLoading(false)
  }

  const inputClass = "dashboard-input w-full px-4 py-2.5 text-sm"
  const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--text-2)]"

  if (inviteCode) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="dashboard-modal w-full max-w-md p-6 text-center">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[var(--text-1)]">Business Created!</h3>
          <p className="mb-5 text-sm text-[var(--text-2)]">
            Share these details directly with the business admin:
          </p>
          {temporaryPassword && (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-6 py-5">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">Admin Temporary Password</p>
              <p className="mt-2 break-all font-mono text-2xl font-bold text-cyan-400">{temporaryPassword}</p>
            </div>
          )}
          <p className="mb-2 text-sm text-[var(--text-2)]">Share this invite code with medics:</p>
          <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-6 py-5 font-mono text-3xl font-bold tracking-widest text-cyan-400">
            {inviteCode}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="dashboard-modal max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <h3 className="mb-5 text-lg font-semibold text-[var(--text-1)]">New Business</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border-b border-[var(--border)] pb-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Business Details</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Business ID *</label>
                <input type="text" value={form.business_id} onChange={e => handleChange('business_id', e.target.value)} required className={inputClass} placeholder="e.g. acme_corp" />
              </div>
              <div>
                <label className={labelClass}>Business Name *</label>
                <input type="text" value={form.business_name} onChange={e => handleChange('business_name', e.target.value)} required className={inputClass} placeholder="e.g. Acme Corporation" />
              </div>
              <div>
                <label className={labelClass}>Contact Email *</label>
                <input type="email" value={form.contact_email} onChange={e => handleChange('contact_email', e.target.value)} required className={inputClass} placeholder="contact@acme.com" />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Admin Account</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Admin Name *</label>
                <input type="text" value={form.admin_display_name} onChange={e => handleChange('admin_display_name', e.target.value)} required className={inputClass} placeholder="Jane Smith" />
              </div>
              <div>
                <label className={labelClass}>Admin Email *</label>
                <input type="email" value={form.admin_email} onChange={e => handleChange('admin_email', e.target.value)} required className={inputClass} placeholder="jane@acme.com" />
              </div>
              <div>
                <label className={labelClass}>Temporary Password *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.temporary_password}
                    onChange={e => handleChange('temporary_password', e.target.value)}
                    required
                    minLength={8}
                    className={inputClass}
                    placeholder="Minimum 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => handleChange('temporary_password', generateTemporaryPassword())}
                    className="shrink-0 rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-input)]"
                  >
                    Generate
                  </button>
                </div>
              </div>
              <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
                Share this temporary password directly with the admin. They will sign in with it once and then change it in account settings.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Business'}
            </button>
            <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-input)]">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
