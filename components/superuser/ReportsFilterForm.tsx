'use client'

import { useMemo, useState } from 'react'

type BusinessOption = {
  id: string
  name: string
}

type SiteOption = {
  id: string
  business_id: string
  name: string
}

interface Props {
  businesses: BusinessOption[]
  sites: SiteOption[]
  selectedBusinessId: string
  selectedSiteId: string
  fromDate: string
  toDate: string
  pdfHref: string | null
}

export default function ReportsFilterForm({
  businesses,
  sites,
  selectedBusinessId,
  selectedSiteId,
  fromDate,
  toDate,
  pdfHref,
}: Props) {
  const [businessId, setBusinessId] = useState(selectedBusinessId)
  const [siteId, setSiteId] = useState(selectedSiteId)

  const businessSites = useMemo(
    () => sites.filter((site) => site.business_id === businessId),
    [businessId, sites],
  )

  return (
    <form className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-5 md:grid-cols-5">
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Business</label>
        <select
          name="business_id"
          value={businessId}
          onChange={(event) => {
            setBusinessId(event.target.value)
            setSiteId('all')
          }}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)]"
          required
        >
          <option value="">Select business...</option>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>{business.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Site</label>
        <select
          name="site_id"
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)]"
        >
          <option value="all">All sites</option>
          {businessSites.map((site) => (
            <option key={site.id} value={site.id}>{site.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">From</label>
        <input
          type="date"
          name="from"
          defaultValue={fromDate}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)]"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">To</label>
        <input
          type="date"
          name="to"
          defaultValue={toDate}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)]"
        />
      </div>

      <div className="flex flex-wrap gap-3 md:col-span-5">
        <button
          type="submit"
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
        >
          Pull Report
        </button>
        {pdfHref && (
          <a
            href={pdfHref}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
          >
            Export PDF
          </a>
        )}
      </div>
    </form>
  )
}
