import { listSurveillancePrograms } from '@/lib/surveillance/queries'

export default async function SurveillanceProgramsPage() {
  let data = null

  try {
    data = await listSurveillancePrograms()
  } catch (error) {
    console.error('[surveillance/programs] failed to load programs', error)
  }

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">Surveillance program management is temporarily unavailable for this account.</div>
      </div>
    )
  }

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Catalogue</p>
          <h1 className="surv-title">Catalogue</h1>
          <p className="surv-subtitle">Surveillance requirement types and the legacy program catalogue that still supports existing flows.</p>
        </div>
      </div>

      {data.surveillanceTypes.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--surv-text)]">Surveillance types</h2>
            <p className="text-sm text-[var(--surv-muted)]">Precision requirement catalogue used for future assignment and frequency rules.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.surveillanceTypes.map((surveillanceType) => (
              <div key={surveillanceType.id} className="surv-card-soft">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--surv-text)]">{surveillanceType.name}</h2>
                    <p className="mt-1 text-xs uppercase tracking-wide text-[var(--surv-muted)]">{surveillanceType.code}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${surveillanceType.is_active ? 'bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]' : 'bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]'}`}>
                    {surveillanceType.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="mt-3 text-sm text-[var(--surv-muted)]">{surveillanceType.description ?? 'No description set.'}</p>
                <p className="mt-4 text-sm text-[var(--surv-text)]">
                  Default interval: {surveillanceType.default_interval_days} days
                  {surveillanceType.baseline_interval_days ? ` • baseline ${surveillanceType.baseline_interval_days} days` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Legacy programs</h2>
          <p className="text-sm text-[var(--surv-muted)]">Backward-compatible catalogue currently used by the legacy enrolment and appointment flows.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {data.programs.map((program) => (
            <div key={program.id} className="surv-card-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--surv-text)]">{program.name}</h2>
                  <p className="mt-1 text-xs uppercase tracking-wide text-[var(--surv-muted)]">{program.code}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${program.is_active ? 'bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]' : 'bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]'}`}>
                  {program.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <p className="mt-3 text-sm text-[var(--surv-muted)]">{program.description ?? 'No description set.'}</p>
              <p className="mt-4 text-sm text-[var(--surv-text)]">Default interval: {program.interval_days} days</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
