'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface WorkerSearchOption {
  id: string
  displayName: string
  role: string
  siteName: string | null
  complianceStatus: 'green' | 'amber' | 'red' | 'grey'
  nextDueAt: string | null
  rosterLabel: string
}

function statusLabel(status: WorkerSearchOption['complianceStatus']) {
  switch (status) {
    case 'green':
      return 'Current'
    case 'amber':
      return 'Due soon'
    case 'red':
      return 'Overdue'
    case 'grey':
    default:
      return 'Needs setup'
  }
}

export default function WorkerSearchCombobox({ workers }: { workers: WorkerSearchOption[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized.length < 2) return []

    return workers
      .filter((worker) => (
        worker.displayName.toLowerCase().includes(normalized) ||
        worker.role.toLowerCase().includes(normalized) ||
        worker.siteName?.toLowerCase().includes(normalized)
      ))
      .slice(0, 8)
  }, [query, workers])

  return (
    <div className="relative w-full">
      <label htmlFor="worker-search" className="block text-sm font-semibold text-[var(--surv-text)]">
        Find a worker
      </label>
      <p className="mt-1 text-xs text-[var(--surv-muted)]">
        Type a name, role, or site, then select a worker to open their profile.
      </p>
      <input
        id="worker-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="surv-input mt-3"
        placeholder="Start typing a worker name..."
        autoComplete="off"
      />

      {query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-96 overflow-y-auto rounded-lg border border-[var(--surv-border)] bg-[var(--surv-panel)] p-2 shadow-2xl">
          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((worker) => (
                <button
                  key={worker.id}
                  type="button"
                  onClick={() => router.push(`/surveillance/workers/${worker.id}`)}
                  className="w-full rounded-lg border border-[var(--surv-border)] bg-[var(--surv-card)] px-3 py-3 text-left transition hover:bg-[var(--surv-panel-soft)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--surv-text)]">{worker.displayName}</p>
                      <p className="mt-1 text-xs text-[var(--surv-muted)]">
                        {worker.role}{worker.siteName ? ` • ${worker.siteName}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-[var(--surv-muted)]">{worker.rosterLabel}</p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-[var(--surv-accent-border)] bg-[var(--surv-accent-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--surv-text)]">
                      {statusLabel(worker.complianceStatus)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-sm text-[var(--surv-muted)]">No matching workers found.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
