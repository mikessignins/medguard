'use client'

import { useState } from 'react'
import { bulkEnrollSurveillanceWorkersAction } from '@/lib/surveillance/actions'

export default function BulkEnrollmentModal({
  businessId,
  redirectTo,
  availableSurveillanceTypes,
  availableSites,
  availableRoles,
}: {
  businessId: string
  redirectTo: string
  availableSurveillanceTypes: Array<{ id: string; name: string }>
  availableSites: Array<{ id: string; name: string }>
  availableRoles: Array<{ id: string; name: string }>
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (availableSurveillanceTypes.length === 0) return null

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-teal-600"
        >
          Bulk enrolment
        </button>
        <span className="group relative inline-flex">
          <span
            tabIndex={0}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--surv-border)] text-xs font-semibold text-[var(--surv-muted)] outline-none transition hover:border-[var(--surv-accent-border)] hover:text-[var(--surv-text)] focus:border-[var(--surv-accent-border)] focus:text-[var(--surv-text)]"
            aria-label="Assign one surveillance requirement to many matching workers."
          >
            ?
          </span>
          <span className="pointer-events-none absolute left-1/2 top-7 z-30 hidden w-72 -translate-x-1/2 rounded-lg border border-[var(--surv-border)] bg-[var(--surv-panel)] px-3 py-2 text-xs leading-relaxed text-[var(--surv-text)] shadow-xl group-hover:block group-focus-within:block">
            Assign one surveillance requirement to many matching workers at once. You can narrow the batch by site or role before running it.
          </span>
        </span>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-6 backdrop-blur-sm md:pt-10">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-enrolment-title"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--surv-border)] bg-[var(--surv-panel)] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="surv-kicker">Bulk action</p>
                <h2 id="bulk-enrolment-title" className="mt-2 text-xl font-semibold text-[var(--surv-text)]">
                  Bulk enrolment
                </h2>
                <p className="mt-1 text-sm text-[var(--surv-muted)]">
                  Enrol many eligible workers into one surveillance requirement.
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

            <form action={bulkEnrollSurveillanceWorkersAction} className="mt-5 space-y-4">
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <p className="text-sm text-[var(--surv-muted)]">
                Choose one requirement, optionally narrow it by site or role, then create active enrolments for matching workers who are not already enrolled.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <select name="surveillanceTypeId" required className="surv-input">
                  <option value="">Select surveillance type</option>
                  {availableSurveillanceTypes.map((surveillanceType) => (
                    <option key={surveillanceType.id} value={surveillanceType.id}>{surveillanceType.name}</option>
                  ))}
                </select>
                <select name="siteId" defaultValue="" className="surv-input">
                  <option value="">All sites</option>
                  {availableSites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
                <select name="selectedWorkerRoleId" defaultValue="" className="surv-input">
                  <option value="">All roles</option>
                  {availableRoles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                <div className="space-y-1">
                  <label htmlFor="bulk-next-due-at" className="block text-xs font-medium text-[var(--surv-text)]">
                    Initial due date
                  </label>
                  <input id="bulk-next-due-at" name="nextDueAt" type="datetime-local" className="surv-input" />
                  <p className="text-xs text-[var(--surv-muted)]">Leave blank if the first due date is not known yet.</p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--surv-text)]">
                <input name="baselineRequired" type="checkbox" value="true" className="h-4 w-4 rounded border border-[var(--surv-border)]" />
                Mark the enrolled requirement as baseline-required
              </label>

              <button type="submit" className="surv-btn-primary">
                Run bulk enrolment
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
