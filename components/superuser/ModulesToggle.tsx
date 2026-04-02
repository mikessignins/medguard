'use client'
import { useState } from 'react'

interface Props {
  businessId: string
  initialEnabled: boolean
}

export default function ModulesToggle({ businessId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleToggle() {
    const next = !enabled
    setEnabled(next)
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/businesses/${businessId}/modules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save')
        setEnabled(!next) // revert
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      setError('Network error')
      setEnabled(!next) // revert
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-[var(--text-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <h2 className="text-base font-semibold text-[var(--text-1)]">Modules</h2>
      </div>
      <p className="text-xs text-[var(--text-2)] mb-4">
        Enable or disable features for this business. Workers will only see enabled modules on their dashboard.
      </p>

      <div className="flex items-center justify-between py-3 border-t border-[var(--border)]">
        <div>
          <p className="text-sm font-medium text-[var(--text-1)]">Confidential Medication Declarations</p>
          <p className="text-xs text-[var(--text-2)] mt-0.5">Workers can submit confidential medication information for medic review</p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {saving && <span className="text-xs text-[var(--text-3)]">Saving…</span>}
          {saved && !saving && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
          {error && <span className="text-xs text-red-500">{error}</span>}
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${
              enabled ? 'bg-cyan-500' : 'bg-slate-300'
            }`}
            aria-pressed={enabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
