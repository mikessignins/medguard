import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  createSurveillanceProviderLocationAction,
  setSurveillanceProviderActiveAction,
  setSurveillanceProviderLocationActiveAction,
  updateSurveillanceProviderLocationAction,
} from '@/lib/surveillance/actions'
import { getSurveillanceProviderDetail } from '@/lib/surveillance/queries'

export default async function SurveillanceProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let data = null

  try {
    data = await getSurveillanceProviderDetail(id)
  } catch (error) {
    console.error('[surveillance/provider-detail] failed to load provider detail', { providerId: id, error })
  }

  if (!data) redirect('/surveillance/providers')

  const activeLocationCount = data.providerLocations.filter((location) => location.is_active).length
  const remoteLocationCount = data.providerLocations.filter((location) => location.supports_remote).length

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <Link href="/surveillance/providers" className="text-sm font-medium text-[var(--surv-accent)] hover:underline">
          Back to providers
        </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--surv-text)]">{data.provider.name}</h1>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">
            {data.provider.provider_type ?? 'Provider'} • manage clinic locations, site linkage, and remote delivery support.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${data.provider.is_active ? 'bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]' : 'bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]'}`}>
          {data.provider.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <section className="surv-card">
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Provider summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-[var(--surv-muted)]">Email</dt>
              <dd className="text-[var(--surv-text)]">{data.provider.contact_email ?? 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Phone</dt>
              <dd className="text-[var(--surv-text)]">{data.provider.contact_phone ?? 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Clinic locations</dt>
              <dd className="text-[var(--surv-text)]">{data.providerLocations.length} total • {activeLocationCount} active</dd>
            </div>
            <div>
              <dt className="text-[var(--surv-muted)]">Remote-capable locations</dt>
              <dd className="text-[var(--surv-text)]">{remoteLocationCount}</dd>
            </div>
          </dl>

          <form action={setSurveillanceProviderActiveAction} className="mt-5">
            <input type="hidden" name="providerId" value={data.provider.id} />
            <input type="hidden" name="isActive" value={data.provider.is_active ? 'false' : 'true'} />
            <button
              type="submit"
              className="surv-btn-secondary"
            >
              {data.provider.is_active ? 'Deactivate provider' : 'Reactivate provider'}
            </button>
          </form>
        </section>

        <section className="surv-card">
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Add clinic location</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">
            Add each physical clinic, site service point, or remote-capable booking location under this provider.
          </p>
          <form action={createSurveillanceProviderLocationAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="providerId" value={data.provider.id} />
            <input
              name="locationName"
              required
              placeholder="Clinic location"
              className="surv-input"
            />
            <select
              name="siteId"
              defaultValue=""
              className="surv-input"
            >
              <option value="">No linked site</option>
              {data.availableSites.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
            <input
              name="addressText"
              placeholder="Address"
              className="surv-input md:col-span-2"
            />
            <input
              name="capacityNotes"
              placeholder="Capacity notes"
              className="surv-input md:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--surv-text)] md:col-span-2">
              <input
                name="supportsRemote"
                type="checkbox"
                value="true"
                className="h-4 w-4 rounded border border-[var(--border)]"
              />
              Supports remote or telehealth delivery
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="surv-btn-primary">
                Add location
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--surv-text)]">Clinic locations</h2>
          <p className="text-sm text-[var(--surv-muted)]">
            Keep location records compact and editable here. Each location should represent a real branch, clinic, or service point.
          </p>
        </div>

        {data.providerLocations.length === 0 ? (
          <div className="surv-empty">
            No clinic locations have been configured for this provider yet.
          </div>
        ) : (
          <div className="space-y-4">
            {data.providerLocations.map((location) => (
              <div key={location.id} className="surv-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--surv-text)]">{location.location_name}</h3>
                    <p className="mt-1 text-sm text-[var(--surv-muted)]">
                      {data.availableSites.find((site) => site.id === location.site_id)?.name ?? 'No linked site'}
                      {location.supports_remote ? ' • Remote-capable' : ''}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${location.is_active ? 'bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]' : 'bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]'}`}>
                    {location.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <form action={updateSurveillanceProviderLocationAction} className="mt-4 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="locationId" value={location.id} />
                  <input
                    name="locationName"
                    required
                    defaultValue={location.location_name}
                    placeholder="Location name"
                    className="surv-input"
                  />
                  <select
                    name="siteId"
                    defaultValue={location.site_id ?? ''}
                    className="surv-input"
                  >
                    <option value="">No linked site</option>
                    {data.availableSites.map((site) => (
                      <option key={site.id} value={site.id}>{site.name}</option>
                    ))}
                  </select>
                  <input
                    name="addressText"
                    defaultValue={location.address_text ?? ''}
                    placeholder="Address"
                    className="surv-input md:col-span-2"
                  />
                  <input
                    name="capacityNotes"
                    defaultValue={location.capacity_notes ?? ''}
                    placeholder="Capacity notes"
                    className="surv-input md:col-span-2"
                  />
                  <label className="flex items-center gap-2 text-sm text-[var(--surv-text)] md:col-span-2">
                    <input
                      name="supportsRemote"
                      type="checkbox"
                      value="true"
                      defaultChecked={location.supports_remote}
                      className="h-4 w-4 rounded border border-[var(--border)]"
                    />
                    Supports remote or telehealth delivery
                  </label>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <button type="submit" className="surv-btn-primary">
                      Save location
                    </button>
                  </div>
                </form>

                <form action={setSurveillanceProviderLocationActiveAction} className="mt-3">
                  <input type="hidden" name="locationId" value={location.id} />
                  <input type="hidden" name="isActive" value={location.is_active ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className="surv-btn-secondary"
                  >
                    {location.is_active ? 'Deactivate location' : 'Reactivate location'}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
