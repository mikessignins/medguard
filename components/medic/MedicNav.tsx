'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ConfiguredBusinessModule, ModuleKey } from '@/lib/modules'
import {
  CONFIDENTIAL_MEDICATION_MODULE_KEY,
  EMERGENCY_DECLARATION_MODULE_KEY,
  FATIGUE_ASSESSMENT_MODULE_KEY,
  getMedicModuleHref,
} from '@/lib/modules'

const MODULE_ICON: Record<ModuleKey, JSX.Element> = {
  emergency_declaration: (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  confidential_medication: (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 9h10a2 2 0 012 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2v-2a2 2 0 012-2z" />
    </svg>
  ),
  fatigue_assessment: (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
    </svg>
  ),
  fit_for_work_plus: (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h6m-7 4h8m-8 4h8m-9 6h10a2 2 0 002-2V7.828a2 2 0 00-.586-1.414l-2.828-2.828A2 2 0 0014.172 3H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
}

function isModuleActive(pathname: string, moduleKey: ModuleKey) {
  const href = getMedicModuleHref(moduleKey)
  if (href === '/medic') return pathname === '/medic'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function isUtilityActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navClass(active: boolean) {
  return active
    ? 'medic-nav-link-active'
    : 'medic-nav-link'
}

function mobileClass(active: boolean) {
  return active
    ? 'flex-1 flex flex-col items-center gap-1 py-3 text-[var(--medic-accent-strong)]'
    : 'flex-1 flex flex-col items-center gap-1 py-3 text-[var(--medic-muted)]'
}

export default function MedicNav({
  modules,
  mobile = false,
}: {
  modules: ConfiguredBusinessModule[]
  mobile?: boolean
}) {
  const pathname = usePathname()

  const visibleModules = modules.filter((module) => {
    if (module.key === EMERGENCY_DECLARATION_MODULE_KEY) return true
    if (module.key === CONFIDENTIAL_MEDICATION_MODULE_KEY || module.key === FATIGUE_ASSESSMENT_MODULE_KEY) {
      return module.enabled
    }
    return module.enabled && module.canActivate
  })

  if (mobile) {
    const primaryModules = visibleModules.slice(0, 3)
    return (
      <nav className="no-print fixed bottom-0 left-0 right-0 z-50 flex border-t border-[var(--medic-border)] bg-[var(--medic-panel-solid)] backdrop-blur md:hidden">
        {primaryModules.map((module) => (
          <Link
            key={module.key}
            href={getMedicModuleHref(module.key)}
            className={mobileClass(isModuleActive(pathname, module.key))}
          >
            <span className="h-5 w-5">{MODULE_ICON[module.key]}</span>
            <span className="text-[11px] font-medium">{module.title.split(' ')[0]}</span>
          </Link>
        ))}
        <Link href="/account" className={mobileClass(isUtilityActive(pathname, '/account'))}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[11px] font-medium">Account</span>
        </Link>
      </nav>
    )
  }

  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-5">
      <div className="space-y-1">
        <p className="medic-rail-section-label">Modules</p>
        {visibleModules.map((module) => (
          <Link key={module.key} href={getMedicModuleHref(module.key)} className={navClass(isModuleActive(pathname, module.key))}>
            {MODULE_ICON[module.key]}
            <div className="min-w-0 flex-1">
              <p className="truncate">{module.title}</p>
              <p className="truncate text-[11px] font-normal opacity-75">{module.readiness === 'live' ? 'Operational dashboard' : module.statusNote}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="space-y-1">
        <p className="medic-rail-section-label">Utilities</p>
        <Link href="/medic/exports" className={navClass(isUtilityActive(pathname, '/medic/exports'))}>
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V4m0 12l-4-4m4 4l4-4M4 18v1a2 2 0 002 2h12a2 2 0 002-2v-1" />
          </svg>
          <div className="min-w-0 flex-1">
            <p>Exports</p>
            <p className="truncate text-[11px] font-normal opacity-75">Reviewed forms and retention</p>
          </div>
        </Link>
      </div>
    </nav>
  )
}
