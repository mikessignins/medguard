import { describe, expect, it } from 'vitest'
import {
  requireAuthenticatedUser,
  requireMedicScope,
  requireOneOfRoles,
  requireRole,
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
