export const CONFIDENTIAL_MEDICATION_MODULE_KEY = 'confidential_medication'

export interface BusinessModule {
  business_id: string
  module_key: string
  enabled: boolean
  config?: Record<string, unknown> | null
}

export function isBusinessModuleEnabled(
  modules: Array<Pick<BusinessModule, 'module_key' | 'enabled'>> | null | undefined,
  moduleKey: string,
) {
  return modules?.some((module) => module.module_key === moduleKey && module.enabled) ?? false
}
