'use client'

import { useState } from 'react'
import ManualWorkerForm from '@/components/surveillance/ManualWorkerForm'

export default function AddWorkerModal({
  availableRoles,
  availableSites,
}: {
  availableRoles: Array<{ id: string; name: string }>
  availableSites: Array<{ id: string; name: string }>
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-emerald-600"
        >
          Add worker
        </button>
        <span className="group relative inline-flex">
          <span
            tabIndex={0}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--surv-border)] text-xs font-semibold text-[var(--surv-muted)] outline-none transition hover:border-[var(--surv-accent-border)] hover:text-[var(--surv-text)] focus:border-[var(--surv-accent-border)] focus:text-[var(--surv-text)]"
            aria-label="Add one worker who does not already have app access."
          >
            ?
          </span>
          <span className="pointer-events-none absolute left-1/2 top-7 z-30 hidden w-64 -translate-x-1/2 rounded-lg border border-[var(--surv-border)] bg-[var(--surv-panel)] px-3 py-2 text-xs leading-relaxed text-[var(--surv-text)] shadow-xl group-hover:block group-focus-within:block">
            Add one worker who does not already have app access. Use operational contact and scheduling details only.
          </span>
        </span>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-6 backdrop-blur-sm md:pt-10">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-worker-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--surv-border)] bg-[var(--surv-panel)] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="surv-kicker">Add worker</p>
                <h2 id="add-worker-title" className="mt-2 text-xl font-semibold text-[var(--surv-text)]">
                  Add worker without app access
                </h2>
                <p className="mt-1 text-sm text-[var(--surv-muted)]">
                  Store operational contact and scheduling details only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="surv-btn-secondary shrink-0"
              >
                Close
              </button>
            </div>

            <div className="mt-5">
              <ManualWorkerForm availableRoles={availableRoles} availableSites={availableSites} embedded />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
