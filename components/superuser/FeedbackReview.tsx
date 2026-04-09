'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { FeedbackItem, FeedbackStatus } from '@/lib/types'
import PaginationControls from '@/components/PaginationControls'

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
  currentStatus: FeedbackStatus | 'All'
  statusCounts: Record<FeedbackStatus, number>
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  pathname: string
}

export default function FeedbackReview({
  items: initialItems,
  currentStatus,
  statusCounts,
  totalCount,
  page,
  pageSize,
  totalPages,
  pathname,
}: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [selected, setSelected] = useState<FeedbackItem | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editStatus, setEditStatus] = useState<FeedbackStatus>('Unread')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

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

  const unreadCount = statusCounts.Unread ?? items.filter(i => i.status === 'Unread').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-1)]">Feedback</h1>
        <p className="mt-0.5 text-sm text-[var(--text-2)]">
          {totalCount} {totalCount === 1 ? 'submission' : 'submissions'} in this view
          {unreadCount > 0 && <span className="ml-2 text-amber-400 font-medium">· {unreadCount} unread</span>}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(['All', ...ALL_STATUSES] as const).map(s => (
          <Link
            key={s}
            href={s === 'All' ? pathname : `${pathname}?status=${encodeURIComponent(s)}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              currentStatus === s
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400'
                : 'border-[var(--border-md)] bg-[var(--bg-surface)] text-[var(--text-2)] hover:bg-[var(--bg-input)]'
            }`}
          >
            {s}
            {s !== 'All' && (
              <span className="ml-1.5 text-xs opacity-60">
                {statusCounts[s]}
              </span>
            )}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-center py-16 text-[var(--text-3)]">No feedback with status &ldquo;{currentStatus}&rdquo;.</p>
      ) : (
        <>
        <div className="space-y-3">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => openItem(item)}
              className="dashboard-panel w-full px-5 py-4 text-left transition-colors hover:bg-[var(--bg-surface)]"
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
                  <p className="line-clamp-2 text-sm text-[var(--text-2)]">{item.message}</p>
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
        {totalPages > 1 && (
          <PaginationControls
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            pathname={pathname}
            searchParams={{
              status: currentStatus !== 'All' ? currentStatus : undefined,
            }}
          />
        )}
        </>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="dashboard-modal w-full max-w-lg">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[selected.category] ?? ''}`}>
                  {selected.category}
                </span>
                <h2 className="text-base font-semibold text-[var(--text-1)]">Feedback Detail</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <p className="mb-1 text-xs text-[var(--text-3)]">Submitted by</p>
                <p className="text-sm text-[var(--text-2)]">
                  {selected.submitted_by_name ?? 'Unknown'} · <span className="capitalize">{selected.submitted_by_role}</span>
                </p>
                <p className="text-xs text-[var(--text-3)] mt-0.5">
                  {(() => { try { return format(new Date(selected.submitted_at), 'dd MMM yyyy, HH:mm') } catch { return selected.submitted_at } })()}
                </p>
              </div>

              <div>
                <p className="mb-1 text-xs text-[var(--text-3)]">Message</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-1)]">{selected.message}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[var(--text-3)]">Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as FeedbackStatus)}
                  className="dashboard-input w-full px-3 py-2 text-sm"
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[var(--text-3)]">Internal Notes</label>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="Add notes for the team…"
                  rows={3}
                  className="dashboard-input w-full resize-none px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 pb-5">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
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
