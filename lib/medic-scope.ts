export interface MedicScopeAccount {
  business_id: string | null
  site_ids: string[] | null
}

export interface ScopedRecord {
  business_id: string | null
  site_id: string | null
}

export function normalizeSiteIds(siteIds: string[] | null | undefined): string[] {
  return Array.isArray(siteIds) ? siteIds.filter(Boolean) : []
}

export function hasMedicScopeAccess(
  account: MedicScopeAccount,
  record: ScopedRecord
): boolean {
  if (!account.business_id || !record.business_id || account.business_id !== record.business_id) {
    return false
  }

  const allowedSiteIds = normalizeSiteIds(account.site_ids)
  if (!record.site_id || allowedSiteIds.length === 0) {
    return false
  }

  return allowedSiteIds.includes(record.site_id)
}
