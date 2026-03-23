'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Business } from '@/lib/types'

interface BusinessRow extends Business {
  adminCount: number
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
  const supabase = createClient()

  const [form, setForm] = useState({
    business_id: '',
    business_name: '',
    contact_email: '',
    admin_display_name: '',
    admin_email: '',
    admin_password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteCode, setInviteCode] = useState<string | null>(null)

  function handleChange(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: fnError } = await supabase.functions.invoke('create-admin', {
      body: {
        business_id: form.business_id,
        business_name: form.business_name,
        contact_email: form.contact_email,
        admin_display_name: form.admin_display_name,
        admin_email: form.admin_email,
        admin_password: form.admin_password,
      },
    })

    if (fnError) {
      setError(fnError.message || 'Failed to create business')
      setLoading(false)
      return
    }

    if (data?.invite_code) {
      setInviteCode(data.invite_code)
    }

    const newBiz: BusinessRow = {
      id: form.business_id,
      name: form.business_name,
      contact_email: form.contact_email,
      adminCount: 1,
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

  const inputClass = "w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-slate-100 placeholder-slate-500 text-sm transition-colors"
  const labelClass = "block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5"

  if (inviteCode) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-100 mb-2">Business Created!</h3>
          <p className="text-sm text-slate-400 mb-5">Share this invite code with the medics:</p>
          <div className="bg-slate-950 border border-slate-700 text-cyan-400 text-3xl font-mono font-bold tracking-widest px-6 py-5 rounded-xl mb-5">
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
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-100 mb-5">New Business</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border-b border-slate-700/50 pb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Business Details</p>
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Admin Account</p>
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
                <label className={labelClass}>Admin Password *</label>
                <input type="password" value={form.admin_password} onChange={e => handleChange('admin_password', e.target.value)} required minLength={8} className={inputClass} />
              </div>
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
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 rounded-lg font-medium text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
