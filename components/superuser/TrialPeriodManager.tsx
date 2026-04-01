'use client'
import { useState } from 'react'
import { format, addDays, addMonths } from 'date-fns'

interface Props {
  businessId: string
  initialTrialUntil: string | null
}

const PRESETS = [
  { label: '7 days', date: () => addDays(new Date(), 7) },
  { label: '14 days', date: () => addDays(new Date(), 14) },
  { label: '1 month', date: () => addMonths(new Date(), 1) },
]

export default function TrialPeriodManager({ businessId, initialTrialUntil }: Props) {
  const [trialUntil, setTrialUntil] = useState<string | null>(initialTrialUntil)
  const [customDate, setCustomDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const isActive = trialUntil !== null && new Date(trialUntil) > new Date()

  async function save(newValue: string | null) {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/businesses/${businessId}/trial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trial_until: newValue }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save')
      } else {
        setTrialUntil(newValue)
        setCustomDate('')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  function applyPreset(date: Date) {
    // End of day so the full day is covered
    date.setHours(23, 59, 59, 0)
    save(date.toISOString())
  }

  function applyCustomDate() {
    if (!customDate) return
    const d = new Date(customDate)
    d.setHours(23, 59, 59, 0)
    save(d.toISOString())
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-base font-semibold text-slate-700">Trial Period</h2>
        {isActive && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium ml-1">
            Active
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        While a trial period is active, all new submissions are automatically tagged as test forms.
        Test forms are excluded from billing and cannot be exported.
      </p>

      {error && (
        <p className="text-xs text-red-500 mb-3">{error}</p>
      )}

      {trialUntil && (
        <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg mb-4 text-sm ${
          isActive
            ? 'bg-amber-50 border border-amber-200 text-amber-800'
            : 'bg-slate-50 border border-slate-200 text-slate-500'
        }`}>
          <span>
            {isActive ? 'Trial active until' : 'Trial expired'}{' '}
            <span className="font-medium">
              {format(new Date(trialUntil), 'dd MMM yyyy')}
            </span>
          </span>
          {isActive && (
            <button
              onClick={() => save(null)}
              disabled={saving}
              className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
            >
              End trial
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {/* Quick presets */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Quick set</p>
          <div className="flex gap-2">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.date())}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
            {saved && <span className="text-xs text-emerald-600 font-medium self-center">Saved</span>}
            {saving && <span className="text-xs text-slate-400 self-center">Saving…</span>}
          </div>
        </div>

        {/* Custom date */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Custom end date</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={customDate}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setCustomDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <button
              onClick={applyCustomDate}
              disabled={!customDate || saving}
              className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-40"
            >
              Set
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
