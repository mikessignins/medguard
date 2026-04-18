import { scheduleSurveillanceAppointmentAction } from '@/lib/surveillance/actions'

export default function ScheduleAppointmentForm({
  enrolmentId,
  availableProviders = [],
  availableProviderLocations = [],
}: {
  enrolmentId: string
  availableProviders?: Array<{ id: string; name: string }>
  availableProviderLocations?: Array<{ id: string; providerId: string; label: string }>
}) {
  return (
    <div className="space-y-3 rounded-[26px] border border-[var(--surv-border)] bg-[var(--surv-panel)] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--surv-text)]">Schedule appointment</h3>
        <p className="mt-0.5 text-xs text-[var(--surv-muted)]">
          Scheduling records the administrative appointment details only — time, location, and provider.
          No clinical findings are stored here.
        </p>
      </div>
      <form action={scheduleSurveillanceAppointmentAction} className="space-y-3">
        <input type="hidden" name="enrolmentId" value={enrolmentId} />

        <div>
          <label htmlFor={`scheduledAt-${enrolmentId}`} className="mb-1 block text-xs font-medium text-[var(--surv-text)]">
            Appointment date and time <span className="text-[var(--surv-red-text)]">*</span>
          </label>
          <input
            id={`scheduledAt-${enrolmentId}`}
            name="scheduledAt"
            type="datetime-local"
            required
            className="surv-input"
          />
        </div>

        <div>
          <label htmlFor={`appointmentType-${enrolmentId}`} className="mb-1 block text-xs font-medium text-[var(--surv-text)]">
            Appointment type
          </label>
          <select
            id={`appointmentType-${enrolmentId}`}
            name="appointmentType"
            defaultValue="periodic"
            className="surv-input"
          >
            <option value="periodic">Periodic — routine scheduled surveillance</option>
            <option value="baseline">Baseline — new starter or role-change initial assessment</option>
            <option value="exit">Exit — post-exposure or separation obligation</option>
            <option value="ad_hoc">Ad hoc — unscheduled or additional appointment</option>
          </select>
        </div>

        <div>
          <label htmlFor={`location-${enrolmentId}`} className="mb-1 block text-xs font-medium text-[var(--surv-text)]">
            Location <span className="text-xs font-normal text-[var(--surv-muted)]">(optional)</span>
          </label>
          <input
            id={`location-${enrolmentId}`}
            name="location"
            type="text"
            placeholder="e.g. Clinic room 2, site med centre, telehealth"
            className="surv-input"
          />
        </div>

        {availableProviders.length > 0 ? (
          <div className="space-y-3">
            <div>
              <label htmlFor={`providerId-${enrolmentId}`} className="mb-1 block text-xs font-medium text-[var(--surv-text)]">
                Provider <span className="text-xs font-normal text-[var(--surv-muted)]">(optional)</span>
              </label>
              <select
                id={`providerId-${enrolmentId}`}
                name="providerId"
                defaultValue=""
                className="surv-input"
              >
                <option value="">No provider selected</option>
                {availableProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </div>
            {availableProviderLocations.length > 0 ? (
              <div>
                <label htmlFor={`providerLocationId-${enrolmentId}`} className="mb-1 block text-xs font-medium text-[var(--surv-text)]">
                  Clinic location <span className="text-xs font-normal text-[var(--surv-muted)]">(optional)</span>
                </label>
                <select
                  id={`providerLocationId-${enrolmentId}`}
                  name="providerLocationId"
                  defaultValue=""
                  className="surv-input"
                >
                  <option value="">No clinic location selected</option>
                  {availableProviderLocations.map((location) => (
                    <option key={location.id} value={location.id}>{location.label}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <label htmlFor={`instructions-${enrolmentId}`} className="mb-1 block text-xs font-medium text-[var(--surv-text)]">
            Worker instructions <span className="text-xs font-normal text-[var(--surv-muted)]">(optional)</span>
          </label>
          <textarea
            id={`instructions-${enrolmentId}`}
            name="instructions"
            rows={3}
            placeholder="Administrative instructions only — e.g. fasting required, bring ID. Do not include clinical findings."
            className="surv-input"
          />
        </div>

        <button type="submit" className="surv-btn-primary">
          Schedule appointment
        </button>
      </form>
    </div>
  )
}
