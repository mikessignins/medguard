import { describe, expect, it } from 'vitest'
import {
  requireAuthenticatedUser,
  requireActiveMedic,
  requireMedicScope,
  requireOneOfRoles,
  requireRole,
  requireScopedBusinessAccess,
} from '../route-access'

describe('requireAuthenticatedUser', () => {
  it('returns unauthorized when no user id is present', () => {
    expect(requireAuthenticatedUser(null)).toEqual({
      error: 'Unauthorized',
      status: 401,
    })
  })

  it('allows authenticated users through', () => {
    expect(requireAuthenticatedUser('user-1')).toBeNull()
  })
})

describe('requireActiveMedic', () => {
  it('allows active medics without an expired contract', () => {
    expect(requireActiveMedic({ role: 'medic', is_inactive: false })).toBeNull()
    expect(requireActiveMedic({
      role: 'medic',
      is_inactive: false,
      contract_end_date: '2999-01-01T00:00:00.000Z',
    })).toBeNull()
  })

  it('blocks inactive, non-medic, and expired medic accounts', () => {
    expect(requireActiveMedic({ role: 'medic', is_inactive: true })).toEqual({
      error: 'Forbidden',
      status: 403,
    })
    expect(requireActiveMedic({ role: 'admin', is_inactive: false })).toEqual({
      error: 'Forbidden',
      status: 403,
    })
    expect(requireActiveMedic({
      role: 'medic',
      is_inactive: false,
      contract_end_date: '2000-01-01T00:00:00.000Z',
    })).toEqual({
      error: 'Forbidden',
      status: 403,
    })
  })
})

describe('requireRole', () => {
  it('allows the matching role', () => {
    expect(requireRole({ role: 'superuser' }, 'superuser')).toBeNull()
  })

  it('blocks missing or incorrect roles', () => {
    expect(requireRole({ role: 'admin' }, 'superuser')).toEqual({
      error: 'Forbidden',
      status: 403,
    })
    expect(requireRole(null, 'medic')).toEqual({
      error: 'Forbidden',
      status: 403,
    })
  })
})

describe('requireOneOfRoles', () => {
  it('allows accounts in the permitted role set', () => {
    expect(requireOneOfRoles({ role: 'medic' }, ['medic', 'admin'])).toBeNull()
    expect(requireOneOfRoles({ role: 'admin' }, ['medic', 'admin'])).toBeNull()
  })

  it('blocks accounts outside the permitted role set', () => {
    expect(requireOneOfRoles({ role: 'worker' }, ['medic', 'admin'])).toEqual({
      error: 'Forbidden',
      status: 403,
    })
  })
})

describe('requireMedicScope', () => {
  const account = { business_id: 'biz-1', site_ids: ['site-a', 'site-b'] }

  it('allows medics whose business and site match the record', () => {
    expect(requireMedicScope(account, { business_id: 'biz-1', site_id: 'site-b' })).toBeNull()
  })

  it('blocks out-of-scope site access', () => {
    expect(requireMedicScope(account, { business_id: 'biz-1', site_id: 'site-c' })).toEqual({
      error: 'Forbidden',
      status: 403,
    })
  })

  it('blocks cross-business access or missing records', () => {
    expect(requireMedicScope(account, { business_id: 'biz-2', site_id: 'site-a' })).toEqual({
      error: 'Forbidden',
      status: 403,
    })
    expect(requireMedicScope(account, null)).toEqual({
      error: 'Forbidden',
      status: 403,
    })
  })
})

describe('requireScopedBusinessAccess', () => {
  it('allows superusers to access any business', () => {
    expect(requireScopedBusinessAccess({
      role: 'superuser',
      business_id: null,
    }, 'biz-2')).toBeNull()
  })

  it('blocks non-superuser roles', () => {
    expect(requireScopedBusinessAccess({ role: 'admin', business_id: 'biz-1' }, 'biz-1')).toEqual({
      error: 'Forbidden',
      status: 403,
    })
  })
})
