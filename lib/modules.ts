export type ModuleKey =
  | 'emergency_declaration'
  | 'confidential_medication'
  | 'fatigue_assessment'
  | 'psychosocial_health'
  | 'fit_for_work_plus'

export type ModuleSurface =
  | 'worker_home'
  | 'medic_queue'
  | 'medic_exports'
  | 'admin_reporting'
  | 'superuser_config'

export type ModuleSubmissionBackend =
  | 'legacy_emergency'
  | 'legacy_medication'
  | 'module_engine'

export type ModuleReadiness =
  | 'live'
  | 'foundation_ready'
  | 'planned'

export interface BusinessModule {
  business_id: string
  module_key: string
  enabled: boolean
  config?: Record<string, unknown> | null
}

export interface ModuleRegistryEntry {
  key: ModuleKey
  title: string
  description: string
  category: 'core' | 'optional' | 'custom'
  icon: string
  medicHref?: string
  surfaces: ModuleSurface[]
  submissionBackend: ModuleSubmissionBackend
  supportsExport: boolean
  supportsPurge: boolean
  isBillable: boolean
  readiness: ModuleReadiness
  canActivate: boolean
  statusNote: string
}

export interface ConfiguredBusinessModule extends ModuleRegistryEntry {
  enabled: boolean
  config: Record<string, unknown> | null
}

export const EMERGENCY_DECLARATION_MODULE_KEY: ModuleKey = 'emergency_declaration'
export const CONFIDENTIAL_MEDICATION_MODULE_KEY: ModuleKey = 'confidential_medication'
export const FATIGUE_ASSESSMENT_MODULE_KEY: ModuleKey = 'fatigue_assessment'
export const PSYCHOSOCIAL_HEALTH_MODULE_KEY: ModuleKey = 'psychosocial_health'
export const FIT_FOR_WORK_PLUS_MODULE_KEY: ModuleKey = 'fit_for_work_plus'

export const MODULE_REGISTRY: Record<ModuleKey, ModuleRegistryEntry> = {
  emergency_declaration: {
    key: 'emergency_declaration',
    title: 'Emergency Medical Declaration',
    description: 'Core worker declaration workflow for site attendance and emergency medical information.',
    category: 'core',
    icon: 'file-heart',
    medicHref: '/medic/emergency',
    surfaces: ['worker_home', 'medic_queue', 'medic_exports', 'admin_reporting', 'superuser_config'],
    submissionBackend: 'legacy_emergency',
    supportsExport: true,
    supportsPurge: true,
    isBillable: true,
    readiness: 'live',
    canActivate: true,
    statusNote: 'Live across the current worker and medic workflows.',
  },
  confidential_medication: {
    key: 'confidential_medication',
    title: 'Confidential Medication Declaration',
    description: 'Workers can submit confidential medication information for medic review.',
    category: 'optional',
    icon: 'shield-plus',
    medicHref: '/medic/medications',
    surfaces: ['worker_home', 'medic_queue', 'medic_exports', 'admin_reporting', 'superuser_config'],
    submissionBackend: 'legacy_medication',
    supportsExport: true,
    supportsPurge: true,
    isBillable: true,
    readiness: 'live',
    canActivate: true,
    statusNote: 'Live across the current worker and medic workflows.',
  },
  fatigue_assessment: {
    key: 'fatigue_assessment',
    title: 'Fatigue Assessment',
    description: 'Fatigue self-assessment on iOS with medic review queues on the web app.',
    category: 'custom',
    icon: 'moon-star',
    medicHref: '/medic/fatigue',
    surfaces: ['worker_home', 'medic_queue', 'medic_exports', 'admin_reporting', 'superuser_config'],
    submissionBackend: 'module_engine',
    supportsExport: true,
    supportsPurge: true,
    isBillable: true,
    readiness: 'live',
    canActivate: true,
    statusNote: 'Worker fatigue checks, medic review, and reviewed-fatigue exports are live.',
  },
  psychosocial_health: {
    key: 'psychosocial_health',
    title: 'Psychosocial Health & Wellbeing',
    description: 'Umbrella psychosocial module for wellbeing pulse reporting, support check-ins, and post-incident welfare cases.',
    category: 'custom',
    icon: 'brain',
    medicHref: '/medic/psychosocial',
    surfaces: ['worker_home', 'medic_queue', 'medic_exports', 'admin_reporting', 'superuser_config'],
    submissionBackend: 'module_engine',
    supportsExport: true,
    supportsPurge: true,
    isBillable: true,
    readiness: 'foundation_ready',
    canActivate: false,
    statusNote: 'Pulse, support check-ins, and post-incident welfare are now taking shape under one umbrella module.',
  },
  fit_for_work_plus: {
    key: 'fit_for_work_plus',
    title: 'Fit For Work Plus',
    description: 'Future enhanced fit-for-work workflow for customer-specific requirements.',
    category: 'custom',
    icon: 'clipboard-check',
    medicHref: '/medic/fit-for-work-plus',
    surfaces: ['worker_home', 'medic_queue', 'admin_reporting', 'superuser_config'],
    submissionBackend: 'module_engine',
    supportsExport: false,
    supportsPurge: false,
    isBillable: false,
    readiness: 'planned',
    canActivate: false,
    statusNote: 'Planned concept only. No active schema or client workflow yet.',
  },
}

export const MODULE_KEYS = Object.keys(MODULE_REGISTRY) as ModuleKey[]

export function isKnownModuleKey(value: string): value is ModuleKey {
  return value in MODULE_REGISTRY
}

export function isBusinessModuleEnabled(
  modules: Array<Pick<BusinessModule, 'module_key' | 'enabled'>> | null | undefined,
  moduleKey: ModuleKey,
) {
  return modules?.some((module) => module.module_key === moduleKey && module.enabled) ?? false
}

export function getConfiguredBusinessModules(
  modules: BusinessModule[] | null | undefined,
  opts?: { includeFutureModules?: boolean; surface?: ModuleSurface },
): ConfiguredBusinessModule[] {
  const includeFutureModules = opts?.includeFutureModules ?? true

  return MODULE_KEYS
    .map((key) => {
      const registry = MODULE_REGISTRY[key]
      const row = modules?.find((module) => module.module_key === key)
      const enabled = row?.enabled ?? registry.category === 'core'
      return {
        ...registry,
        enabled,
        config: (row?.config as Record<string, unknown> | null | undefined) ?? null,
      }
    })
    .filter((module) => includeFutureModules || module.submissionBackend !== 'module_engine')
    .filter((module) => !opts?.surface || module.surfaces.includes(opts.surface))
}

export function getModuleReadinessLabel(readiness: ModuleReadiness) {
  switch (readiness) {
    case 'live':
      return 'Live'
    case 'foundation_ready':
      return 'Foundation'
    case 'planned':
      return 'Planned'
  }
}

export function getModuleSurfaceLabel(surface: ModuleSurface) {
  switch (surface) {
    case 'worker_home':
      return 'Worker dashboard'
    case 'medic_queue':
      return 'Medic queue'
    case 'medic_exports':
      return 'Medic exports'
    case 'admin_reporting':
      return 'Admin reporting'
    case 'superuser_config':
      return 'Superuser config'
  }
}

export function getMedicModuleHref(moduleKey: ModuleKey) {
  return MODULE_REGISTRY[moduleKey].medicHref ?? '/medic'
}
