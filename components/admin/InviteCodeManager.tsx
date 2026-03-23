'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  initialCode: string | null
  businessId: string
}

export default function InviteCodeManager({ initialCode, businessId }: Props) {
  const supabase = createClient()
  const [code, setCode] = useState(initialCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function regenerate() {
    if (!confirm('Regenerate the invite code? The old code will stop working immediately.')) return
    setLoading(true)
    setError('')

    // Generate a new 6-character alphanumeric code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const newCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

    const { error: upsertError } = await supabase
      .from('invite_codes')
      .upsert({ business_id: businessId, code: newCode }, { onConflict: 'business_id' })

    setLoading(false)
    if (upsertError) { setError(upsertError.message); return }
    setCode(newCode)
  }

  function copyCode() {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Invite Code</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md">
        <p className="text-sm text-slate-600 mb-6">
          Share this code with new medics so they can register and join your organisation via the MedM8 mobile app.
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {code ? (
          <div className="text-center">
            <div className="bg-slate-900 text-white text-3xl font-mono font-bold tracking-widest px-6 py-5 rounded-xl mb-4">
              {code}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={copyCode}
                className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
              <button
                onClick={regenerate}
                disabled={loading}
                className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-4">
              Regenerating will invalidate the current code immediately.
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-slate-400 text-sm mb-4">No invite code found.</p>
            <button
              onClick={regenerate}
              disabled={loading}
              className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Code'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
