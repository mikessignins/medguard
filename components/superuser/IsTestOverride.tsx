'use client'
import { useState } from 'react'
import { format } from 'date-fns'

interface NewSubmission {
  id: string
  submitted_at: string
  site_name: string | null
  is_test: boolean
}

interface Props {
  initialSubmissions: NewSubmission[]
}

export default function IsTestOverride({ initialSubmissions }: Props) {
  const [submissions, setSubmissions] = useState(initialSubmissions)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (submissions.length === 0) return null

  async function toggle(sub: NewSubmission) {
    setToggling(sub.id)
    setError(null)
    const next = !sub.is_test
    try {
      const res = await fetch(`/api/submissions/${sub.id}/test-flag`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_test: next }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to update')
      } else {
        setSubmissions(prev =>
          prev.map(s => s.id === sub.id ? { ...s, is_test: next } : s)
        )
      }
    } catch {
      setError('Network error')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-[var(--text-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <h2 className="text-base font-semibold text-[var(--text-1)]">Mark Forms as Test</h2>
      </div>
      <p className="text-xs text-[var(--text-2)] mb-4">
        Forms currently awaiting review. Toggle the test flag to exclude a form from billing and block export.
        Once a form is reviewed by a medic this flag locks and cannot be changed.
      </p>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <div className="divide-y divide-[var(--border)]">
        {submissions.map(sub => (
          <div key={sub.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm text-[var(--text-1)]">
                {sub.site_name ?? <span className="text-[var(--text-3)] italic">Unknown site</span>}
              </p>
              <p className="text-xs text-[var(--text-3)] mt-0.5">
                Submitted {format(new Date(sub.submitted_at), 'dd MMM yyyy, h:mm a')}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              {sub.is_test && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  TEST
                </span>
              )}
              <button
                onClick={() => toggle(sub)}
                disabled={toggling === sub.id}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${
                  sub.is_test ? 'bg-amber-400' : 'bg-slate-300'
                }`}
                aria-pressed={sub.is_test}
                aria-label={sub.is_test ? 'Unmark as test' : 'Mark as test'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    sub.is_test ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
