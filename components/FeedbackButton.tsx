'use client'
import { useState } from 'react'

type Category = 'Bug' | 'Error' | 'Idea' | 'Other'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<Category>('Idea')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to send feedback')
      } else {
        setSent(true)
        setMessage('')
        setTimeout(() => { setOpen(false); setSent(false) }, 2000)
      }
    } catch {
      setError('Network error, please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const CATEGORIES: Category[] = ['Bug', 'Error', 'Idea', 'Other']

  return (
    <>
      <button
        onClick={() => { setOpen(true); setSent(false); setError(null) }}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all duration-150 w-full text-left"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        Send Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          {/* Modal uses CSS variables so it adapts to light/dark automatically */}
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-md)',
            }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Send Feedback</h2>
              <button
                onClick={() => setOpen(false)}
                className="transition-colors"
                style={{ color: 'var(--text-3)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {sent ? (
              <div className="px-6 py-10 text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-medium" style={{ color: 'var(--text-1)' }}>Thanks for your feedback!</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>It has been sent to the MedPass team.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                        style={
                          category === c
                            ? { backgroundColor: 'rgba(6,182,212,0.1)', borderColor: 'rgba(6,182,212,0.4)', color: '#06b6d4' }
                            : { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-md)', color: 'var(--text-2)' }
                        }
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Describe the issue or idea…"
                    rows={4}
                    required
                    className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-md)',
                      color: 'var(--text-1)',
                    }}
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ color: 'var(--text-2)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Sending…' : 'Send Feedback'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
