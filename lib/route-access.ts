import { hasMedicScopeAccess, type MedicScopeAccount, type ScopedRecord } from '@/lib/medic-scope'

type RouteStatus = 401 | 403

export interface RouteAccessFailure {
  error: 'Unauthorized' | 'Forbidden'
  status: RouteStatus
}

interface RoleAccount {
  role?: string | null
}

export function requireAuthenticatedUser(userId?: string | null): RouteAccessFailure | null {
  if (!userId) {
    return { error: 'Unauthorized', status: 401 }
  }

  return null
}

export function requireRole(
  account: RoleAccount | null | undefined,
  role: string
): RouteAccessFailure | null {
  if (!account || account.role !== role) {
    return { error: 'Forbidden', status: 403 }
  }

  return null
}

export function requireOneOfRoles(
  account: RoleAccount | null | undefined,
  roles: string[]
): RouteAccessFailure | null {
  if (!account || !roles.includes(account.role ?? '')) {
    return { error: 'Forbidden', status: 403 }
  }

  return null
}

export function requireMedicScope(
  account: MedicScopeAccount | null | undefined,
  record: ScopedRecord | null | undefined
): RouteAccessFailure | null {
  if (!account || !record || !hasMedicScopeAccess(account, record)) {
    return { error: 'Forbidden', status: 403 }
  }

  return null
}
