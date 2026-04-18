import type { UserRole } from '@/lib/types'

export interface AppRoleAccount {
  role?: UserRole | string | null
  business_id?: string | null
  display_name?: string | null
  is_inactive?: boolean | null
  contract_end_date?: string | null
}

export function isExpiredAccount(contractEndDate?: string | null, now: Date = new Date()) {
  return Boolean(contractEndDate && new Date(contractEndDate).getTime() < now.getTime())
}

export function isActiveOccHealthAccount(account: AppRoleAccount | null | undefined) {
  return Boolean(
    account
    && account.role === 'occ_health'
    && !account.is_inactive
    && !isExpiredAccount(account.contract_end_date),
  )
}

export function canManageSurveillance(account: AppRoleAccount | null | undefined) {
  if (!account) return false
  if (account.role === 'superuser' || account.role === 'admin') return true
  return isActiveOccHealthAccount(account)
}

export function canAccessSurveillanceDashboard(account: AppRoleAccount | null | undefined) {
  if (!account) return false
  if (account.role === 'superuser') return true
  return isActiveOccHealthAccount(account)
}
