import { hasMedicScopeAccess, type MedicScopeAccount, type ScopedRecord } from '@/lib/medic-scope'

type RouteStatus = 401 | 403

export interface RouteAccessFailure {
  error: 'Unauthorized' | 'Forbidden'
  status: RouteStatus
}

interface RoleAccount {
  role?: string | null
  is_inactive?: boolean | null
  business_id?: string | null
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

export function requireActiveMedic(
  account: RoleAccount | null | undefined,
): RouteAccessFailure | null {
  if (!account || account.role !== 'medic' || account.is_inactive) {
    return { error: 'Forbidden', status: 403 }
  }

  return null
}

export function requireScopedBusinessAccess(
  account: RoleAccount | null | undefined,
  businessId: string,
): RouteAccessFailure | null {
  if (!account || account.role !== 'superuser') {
    return { error: 'Forbidden', status: 403 }
  }

  if (!account.business_id) {
    return null
  }

  if (account.business_id !== businessId) {
    return { error: 'Forbidden', status: 403 }
  }

  return null
}
