'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { FeedbackItem, FeedbackStatus } from '@/lib/types'

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  Unread: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Read: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  Planned: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Implemented: 'bg-green-500/10 text-green-400 border-green-500/20',
  Archived: 'bg-slate-700/50 text-slate-600 border-slate-700/30',
}

const CATEGORY_COLORS: Record<string, string> = {
  Bug: 'bg-red-500/10 text-red-400 border-red-500/20',
  Error: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Idea: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  Other: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

const ALL_STATUSES: FeedbackStatus[] = ['Unread', 'Read', 'Planned', 'Implemented', 'Archived']

interface Props {
  items: FeedbackItem[]
}

export default function FeedbackReview({ items: initialItems }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | 'All'>('Unread')
  const [selected, setSelected] = useState<FeedbackItem | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editStatus, setEditStatus] = useState<FeedbackStatus>('Unread')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    if (filterStatus === 'All') return items
    return items.filter(i => i.status === filterStatus)
  }, [items, filterStatus])

  function openItem(item: FeedbackItem) {
    setSelected(item)
    setEditNote(item.superuser_note ?? '')
    setEditStatus(item.status)
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch(`/api/feedback/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus, superuser_note: editNote }),
      })
      if (res.ok) {
        setItems(prev => prev.map(i =>
          i.id === selected.id
            ? { ...i, status: editStatus, superuser_note: editNote }
            : i
        ))
        setSelected(null)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  const unreadCount = items.filter(i => i.status === 'Unread').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Feedback</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {items.length} {items.length === 1 ? 'submission' : 'submissions'} total
          {unreadCount > 0 && <span className="ml-2 text-amber-400 font-medium">· {unreadCount} unread</span>}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(['All', ...ALL_STATUSES] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              filterStatus === s
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            {s}
            {s !== 'All' && (
              <span className="ml-1.5 text-xs opacity-60">
                {items.filter(i => i.status === s).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-16 text-[var(--text-3)]">No feedback with status &ldquo;{filterStatus}&rdquo;.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => openItem(item)}
              className="w-full text-left bg-slate-800/60 border border-slate-700/50 rounded-xl px-5 py-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[item.category] ?? ''}`}>
                      {item.category}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 line-clamp-2">{item.message}</p>
                  <p className="text-xs text-[var(--text-3)] mt-1.5">
                    {item.submitted_by_name ?? 'Unknown'} · {item.submitted_by_role} · {
                      (() => { try { return format(new Date(item.submitted_at), 'dd MMM yyyy, HH:mm') } catch { return item.submitted_at } })()
                    }
                  </p>
                </div>
                <svg className="w-4 h-4 shrink-0 text-[var(--text-3)] mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[selected.category] ?? ''}`}>
                  {selected.category}
                </span>
                <h2 className="text-base font-semibold text-slate-100">Feedback Detail</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <p className="text-xs text-slate-500 mb-1">Submitted by</p>
                <p className="text-sm text-slate-300">
                  {selected.submitted_by_name ?? 'Unknown'} · <span className="capitalize">{selected.submitted_by_role}</span>
                </p>
                <p className="text-xs text-[var(--text-3)] mt-0.5">
                  {(() => { try { return format(new Date(selected.submitted_at), 'dd MMM yyyy, HH:mm') } catch { return selected.submitted_at } })()}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Message</p>
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{selected.message}</p>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as FeedbackStatus)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Internal Notes</label>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="Add notes for the team…"
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 pb-5">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
