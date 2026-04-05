import { describe, expect, it } from 'vitest'
import { hasMedicScopeAccess, normalizeSiteIds } from '../medic-scope'

describe('normalizeSiteIds', () => {
  it('returns only truthy site ids', () => {
    expect(normalizeSiteIds(['site-a', '', 'site-b', null as never, undefined as never])).toEqual([
      'site-a',
      'site-b',
    ])
  })

  it('returns an empty array for nullish values', () => {
    expect(normalizeSiteIds(null)).toEqual([])
    expect(normalizeSiteIds(undefined)).toEqual([])
  })
})

describe('hasMedicScopeAccess', () => {
  it('allows access when business and site are both in scope', () => {
    expect(hasMedicScopeAccess(
      { business_id: 'biz-1', site_ids: ['site-a', 'site-b'] },
      { business_id: 'biz-1', site_id: 'site-b' },
    )).toBe(true)
  })

  it('denies access when the business does not match', () => {
    expect(hasMedicScopeAccess(
      { business_id: 'biz-1', site_ids: ['site-a'] },
      { business_id: 'biz-2', site_id: 'site-a' },
    )).toBe(false)
  })

  it('denies access when the site is not assigned', () => {
    expect(hasMedicScopeAccess(
      { business_id: 'biz-1', site_ids: ['site-a'] },
      { business_id: 'biz-1', site_id: 'site-b' },
    )).toBe(false)
  })

  it('denies access when any scope component is missing', () => {
    expect(hasMedicScopeAccess(
      { business_id: 'biz-1', site_ids: [] },
      { business_id: 'biz-1', site_id: 'site-a' },
    )).toBe(false)

    expect(hasMedicScopeAccess(
      { business_id: null, site_ids: ['site-a'] },
      { business_id: 'biz-1', site_id: 'site-a' },
    )).toBe(false)
  })
})
