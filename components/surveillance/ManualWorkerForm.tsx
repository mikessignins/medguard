import { createManualSurveillanceWorkerAction } from '@/lib/surveillance/actions'

export default function ManualWorkerForm({
  availableRoles,
  availableSites,
  embedded = false,
}: {
  availableRoles: Array<{ id: string; name: string }>
  availableSites: Array<{ id: string; name: string }>
  embedded?: boolean
}) {
  return (
    <form action={createManualSurveillanceWorkerAction} className={embedded ? 'space-y-4' : 'surv-card space-y-4'}>
      {!embedded ? (
        <div>
          <p className="surv-kicker">Manual intake</p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--surv-text)]">Add worker without app access</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">
            Use this for workers who do not use the app or do not want to use it. Store operational contact and scheduling details only.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <input
          name="displayName"
          required
          placeholder="Full name"
          className="surv-input"
        />
        <input
          name="phone"
          placeholder="Phone number"
          className="surv-input"
        />
        <input
          name="email"
          type="email"
          placeholder="Email address"
          className="surv-input"
        />
        <input
          name="jobRoleName"
          required
          placeholder="Job title shown on record"
          className="surv-input"
        />
        <div className="space-y-1">
          <select
            name="selectedWorkerRoleId"
            className="surv-input"
            defaultValue=""
            disabled={availableRoles.length === 0}
          >
            <option value="">{availableRoles.length === 0 ? 'No site roles loaded' : 'Match to site role'}</option>
            {availableRoles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <p className="text-xs text-[var(--surv-muted)]">
            Optional. Used for role-based bulk enrolment and reporting.
          </p>
        </div>
        <div className="space-y-1">
          <select
            name="siteId"
            className="surv-input"
            defaultValue=""
          >
            <option value="">No site selected</option>
            {availableSites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </div>
      </div>

      <textarea
        name="notesOperational"
        rows={3}
        placeholder="Operational notes only. No clinical findings."
        className="surv-input"
      />

      <label className="flex items-center gap-2 text-sm text-[var(--surv-text)]">
        <input type="checkbox" name="requiresHealthSurveillance" value="true" defaultChecked />
        Requires health surveillance
      </label>

      <button type="submit" className="surv-btn-primary">
        Add worker
      </button>
    </form>
  )
}
