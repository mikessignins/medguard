import {
  getModuleReadinessLabel,
  getModuleSurfaceLabel,
  type ConfiguredBusinessModule,
} from '@/lib/modules'

interface Props {
  modules: ConfiguredBusinessModule[]
  title?: string
  description?: string
  showBusinessEnabledState?: boolean
}

function badgeClass(readiness: ConfiguredBusinessModule['readiness']) {
  switch (readiness) {
    case 'live':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'foundation_ready':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'planned':
      return 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
  }
}

export default function ModuleCatalog({
  modules,
  title = 'Module Catalogue',
  description = 'See which modules are live, seeded, or still planned before turning them on for a business.',
  showBusinessEnabledState = true,
}: Props) {
  return (
    <div className="rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[var(--text-1)]">{title}</h2>
        <p className="mt-1 text-xs text-[var(--text-2)]">{description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <div key={module.key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-1)]">{module.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${badgeClass(module.readiness)}`}>
                {getModuleReadinessLabel(module.readiness)}
              </span>
              <span className="rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
                {module.category}
              </span>
            </div>

            <p className="mt-2 text-xs text-[var(--text-2)]">{module.description}</p>
            <p className="mt-2 text-xs text-[var(--text-3)]">{module.statusNote}</p>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--text-2)]">
              <span className="rounded-full bg-[var(--bg-card)] px-2 py-1">
                {module.isBillable ? 'Billable' : 'Non-billable'}
              </span>
              <span className="rounded-full bg-[var(--bg-card)] px-2 py-1">
                {module.supportsExport ? 'Exportable' : 'No export'}
              </span>
              <span className="rounded-full bg-[var(--bg-card)] px-2 py-1">
                {module.supportsPurge ? 'Purge managed' : 'No purge'}
              </span>
              {showBusinessEnabledState && (
                <span className="rounded-full bg-[var(--bg-card)] px-2 py-1">
                  {module.enabled ? 'Enabled for business' : 'Not enabled'}
                </span>
              )}
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">Surfaces</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {module.surfaces.map((surface) => (
                  <span
                    key={surface}
                    className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-2)]"
                  >
                    {getModuleSurfaceLabel(surface)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
