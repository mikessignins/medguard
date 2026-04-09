'use client'
import { useState } from 'react'
import {
  getModuleReadinessLabel,
  type ConfiguredBusinessModule,
  type ModuleKey,
} from '@/lib/modules'

interface Props {
  businessId: string
  initialModules: ConfiguredBusinessModule[]
}

export default function ModulesToggle({ businessId, initialModules }: Props) {
  const [modules, setModules] = useState(initialModules)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<ModuleKey | null>(null)

  async function handleToggle(moduleKey: ModuleKey) {
    const nextModules = modules.map((module) =>
      module.key === moduleKey ? { ...module, enabled: !module.enabled } : module,
    )
    setModules(nextModules)
    setSaving(true)
    setError(null)
    setSavedKey(null)
    try {
      const res = await fetch(`/api/businesses/${businessId}/modules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleKey,
          enabled: nextModules.find((module) => module.key === moduleKey)?.enabled ?? false,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save')
        setModules(modules)
      } else {
        setSavedKey(moduleKey)
        setTimeout(() => setSavedKey((current) => (current === moduleKey ? null : current)), 2000)
      }
    } catch {
      setError('Network error')
      setModules(modules)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-5">
      <div className="mb-1 flex items-center gap-2">
        <svg className="h-4 w-4" style={{ color: 'var(--text-2)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Modules</h2>
      </div>
      <p className="text-xs text-[var(--text-2)] mb-4">
        Enable or disable features for this business. Workers will only see enabled modules on their dashboard.
      </p>

      {modules.map((module, index) => {
        const isCore = module.category === 'core'
        const disabled = saving || isCore || !module.canActivate

        return (
          <div key={module.key} className={`flex items-center justify-between py-3 ${index > 0 ? 'border-t border-[var(--border)]' : 'border-t border-[var(--border)]'}`}>
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[var(--text-1)]">{module.title}</p>
                <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
                  {module.category}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    module.readiness === 'live'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : module.readiness === 'foundation_ready'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                        : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {getModuleReadinessLabel(module.readiness)}
                </span>
              </div>
              <p className="text-xs text-[var(--text-2)] mt-0.5">{module.description}</p>
              {!module.canActivate && (
                <p className="mt-1 text-[11px] text-[var(--text-3)]">{module.statusNote}</p>
              )}
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              {saving && <span className="text-xs text-[var(--text-3)]">Saving…</span>}
              {savedKey === module.key && !saving && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button
                onClick={() => handleToggle(module.key)}
                disabled={disabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${
                  module.enabled ? 'bg-cyan-500' : 'bg-slate-300'
                }`}
                aria-pressed={module.enabled}
                title={
                  isCore
                    ? 'Core modules are always enabled'
                    : !module.canActivate
                      ? 'This module is not ready to activate yet'
                      : undefined
                }
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    module.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
