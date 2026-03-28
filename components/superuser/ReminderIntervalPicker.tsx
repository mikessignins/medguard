'use client'
import { useState } from 'react'

const OPTIONS = [
  { value: 1, label: 'Monthly (1 month)' },
  { value: 2, label: 'Every 2 months' },
  { value: 3, label: 'Quarterly (3 months)' },
  { value: 6, label: 'Every 6 months' },
  { value: 12, label: 'Annually (12 months)' },
]

interface Props {
  businessId: string
  initialMonths: number
}

export default function ReminderIntervalPicker({ businessId, initialMonths }: Props) {
  const [months, setMonths] = useState(initialMonths)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleChange(value: number) {
    setMonths(value)
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/businesses/${businessId}/reminder-interval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months: value }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save')
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <h2 className="text-base font-semibold text-slate-700">Declaration Reminders</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Workers at this business will be reminded to review their medical information and submit a new declaration if anything has changed.
      </p>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-600 shrink-0">Review Reminder</label>
        <select
          value={months}
          onChange={e => handleChange(Number(e.target.value))}
          disabled={saving}
          className="flex-1 max-w-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-60"
        >
          {OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {saving && (
          <span className="text-xs text-slate-400">Saving…</span>
        )}
        {saved && !saving && (
          <span className="text-xs text-emerald-600 font-medium">Saved</span>
        )}
        {error && (
          <span className="text-xs text-red-500">{error}</span>
        )}
      </div>
    </div>
  )
}
