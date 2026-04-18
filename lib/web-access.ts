import type { UserRole } from '@/lib/types'

interface WebPortalAccessInput {
  role: UserRole | string
  contractEndDate?: string | null
  isSuspended?: boolean | null
  isInactive?: boolean | null
  now?: Date
}

export type WebPortalDestination =
  | '/suspended'
  | '/expired'
  | '/pending'
  | '/surveillance'
  | '/medic'
  | '/admin'
  | '/superuser'
  | null

export function isExpiredContract(
  contractEndDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  return Boolean(contractEndDate && new Date(contractEndDate) < now)
}

export function resolveWebPortalDestination(
  input: WebPortalAccessInput
): WebPortalDestination {
  if (input.isSuspended) return '/suspended'
  if (isExpiredContract(input.contractEndDate, input.now)) return '/expired'
  if (input.isInactive) return null

  if (input.role === 'pending_medic') return '/pending'
  if (input.role === 'pending_occ_health') return '/pending'
  if (input.role === 'occ_health') return '/surveillance'
  if (input.role === 'medic') return '/medic'
  if (input.role === 'admin') return '/admin'
  if (input.role === 'superuser') return '/superuser'

  return null
}

export function canAccessMedicPortal(
  input: WebPortalAccessInput
): boolean {
  return resolveWebPortalDestination(input) === '/medic'
}

export function canAccessSurveillancePortal(
  input: WebPortalAccessInput
): boolean {
  return resolveWebPortalDestination(input) === '/surveillance'
}
