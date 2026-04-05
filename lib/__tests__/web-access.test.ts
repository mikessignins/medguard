import { describe, expect, it } from 'vitest'
import {
  canAccessMedicPortal,
  isExpiredContract,
  resolveWebPortalDestination,
} from '../web-access'

describe('isExpiredContract', () => {
  const now = new Date('2026-04-05T12:00:00.000Z')

  it('returns false for missing contract dates', () => {
    expect(isExpiredContract(null, now)).toBe(false)
    expect(isExpiredContract(undefined, now)).toBe(false)
  })

  it('returns true only when the contract end date is in the past', () => {
    expect(isExpiredContract('2026-04-04T23:59:59.000Z', now)).toBe(true)
    expect(isExpiredContract('2026-04-05T12:00:00.000Z', now)).toBe(false)
  })
})

describe('resolveWebPortalDestination', () => {
  const now = new Date('2026-04-05T12:00:00.000Z')

  it('prioritizes suspended businesses over all role routing', () => {
    expect(resolveWebPortalDestination({
      role: 'admin',
      isSuspended: true,
      now,
    })).toBe('/suspended')
  })

  it('routes expired contracts to the expired screen before medic portal access', () => {
    expect(resolveWebPortalDestination({
      role: 'medic',
      contractEndDate: '2026-04-04T00:00:00.000Z',
      now,
    })).toBe('/expired')
  })

  it('routes supported roles to their expected portals', () => {
    expect(resolveWebPortalDestination({ role: 'pending_medic', now })).toBe('/pending')
    expect(resolveWebPortalDestination({ role: 'medic', now })).toBe('/medic')
    expect(resolveWebPortalDestination({ role: 'admin', now })).toBe('/admin')
    expect(resolveWebPortalDestination({ role: 'superuser', now })).toBe('/superuser')
  })

  it('returns null for roles without web portal access', () => {
    expect(resolveWebPortalDestination({ role: 'worker', now })).toBeNull()
  })
})

describe('canAccessMedicPortal', () => {
  const now = new Date('2026-04-05T12:00:00.000Z')

  it('allows active medics into the medic portal', () => {
    expect(canAccessMedicPortal({ role: 'medic', now })).toBe(true)
  })

  it('denies suspended or expired medics', () => {
    expect(canAccessMedicPortal({ role: 'medic', isSuspended: true, now })).toBe(false)
    expect(canAccessMedicPortal({
      role: 'medic',
      contractEndDate: '2026-04-04T00:00:00.000Z',
      now,
    })).toBe(false)
  })
})
