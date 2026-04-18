import Link from 'next/link'
import { createSurveillanceProviderAction, setSurveillanceProviderActiveAction } from '@/lib/surveillance/actions'
import { listSurveillanceProvidersPage } from '@/lib/surveillance/queries'

export default async function SurveillanceProvidersPage() {
  let data = null

  try {
    data = await listSurveillanceProvidersPage()
  } catch (error) {
    console.error('[surveillance/providers] failed to load providers', error)
  }

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">Provider management is temporarily unavailable for this account.</div>
      </div>
    )
  }

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Providers</p>
          <h1 className="surv-title">Providers</h1>
          <p className="surv-subtitle">Manage approved occupational health providers and open a provider to work on clinic locations.</p>
        </div>
      </div>

      <form action={createSurveillanceProviderAction} className="surv-card">
        <input type="hidden" name="businessId" value={data.context.account.business_id} />
        <div>
          <p className="surv-kicker">Directory</p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--surv-text)]">Add provider</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">
            Register an approved provider first, then manage its clinic network from the provider detail page.
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="name" required placeholder="Provider name" className="surv-input" />
          <input name="providerType" placeholder="Provider type" className="surv-input" />
          <input name="contactEmail" type="email" placeholder="Contact email" className="surv-input" />
          <input name="contactPhone" placeholder="Contact phone" className="surv-input" />
        </div>
        <div className="mt-4">
          <button type="submit" className="surv-btn-primary">Add provider</button>
        </div>
      </form>

      {data.providers.length === 0 ? (
        <div className="surv-empty">No providers have been configured yet. Add the first provider to start building the clinic directory.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.providers.map((provider) => {
            const providerLocations = data.providerLocations.filter((location) => location.provider_id === provider.id)
            const activeLocationCount = providerLocations.filter((location) => location.is_active).length
            const remoteLocationCount = providerLocations.filter((location) => location.supports_remote).length

            return (
              <div key={provider.id} className="surv-card-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--surv-text)]">{provider.name}</h2>
                    <p className="mt-1 text-xs uppercase tracking-wide text-[var(--surv-muted)]">{provider.provider_type ?? 'Provider'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${provider.is_active ? 'bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]' : 'bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]'}`}>
                    {provider.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <div>
                    <dt className="text-[var(--surv-muted)]">Contact</dt>
                    <dd className="text-[var(--surv-text)]">{provider.contact_email ?? provider.contact_phone ?? 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--surv-muted)]">Clinic locations</dt>
                    <dd className="text-[var(--surv-text)]">{providerLocations.length} total{providerLocations.length > 0 ? ` • ${activeLocationCount} active` : ''}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--surv-muted)]">Remote-capable locations</dt>
                    <dd className="text-[var(--surv-text)]">{remoteLocationCount}</dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/surveillance/providers/${provider.id}`} className="surv-btn-primary">Manage provider</Link>
                  <form action={setSurveillanceProviderActiveAction}>
                    <input type="hidden" name="providerId" value={provider.id} />
                    <input type="hidden" name="isActive" value={provider.is_active ? 'false' : 'true'} />
                    <button type="submit" className="surv-btn-secondary">
                      {provider.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
