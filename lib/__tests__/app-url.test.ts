import { afterEach, describe, expect, it } from 'vitest'
import { getAccountSetupUrl, getAppBaseUrl } from '../app-url'

const originalEnv = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
}

function clearUrlEnv() {
  delete process.env.APP_BASE_URL
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL
  delete process.env.VERCEL_URL
}

afterEach(() => {
  process.env.APP_BASE_URL = originalEnv.APP_BASE_URL
  process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL
  process.env.VERCEL_PROJECT_PRODUCTION_URL = originalEnv.VERCEL_PROJECT_PRODUCTION_URL
  process.env.VERCEL_URL = originalEnv.VERCEL_URL
})

describe('getAppBaseUrl', () => {
  it('prefers configured production base url over the request origin', () => {
    clearUrlEnv()
    process.env.APP_BASE_URL = 'https://medguard-nu.vercel.app/'

    expect(getAppBaseUrl('http://localhost:3000/api/admin/contractor-medics')).toBe('https://medguard-nu.vercel.app')
    expect(getAccountSetupUrl('http://localhost:3000/api/admin/contractor-medics')).toBe('https://medguard-nu.vercel.app/account?setup=password')
  })

  it('falls back to Vercel production url before preview url', () => {
    clearUrlEnv()
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'medguard-nu.vercel.app'
    process.env.VERCEL_URL = 'medguard-preview.vercel.app'

    expect(getAppBaseUrl()).toBe('https://medguard-nu.vercel.app')
  })

  it('uses the request origin when no canonical deployment url is configured', () => {
    clearUrlEnv()

    expect(getAppBaseUrl('https://preview.example.com/api/medic-signup')).toBe('https://preview.example.com')
  })

  it('prefers the Vercel production url over a deployment request origin', () => {
    clearUrlEnv()
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'medguard-nu.vercel.app'

    expect(getAppBaseUrl('https://medguard-preview.vercel.app/api/medic-signup')).toBe('https://medguard-nu.vercel.app')
    expect(getAccountSetupUrl('https://medguard-preview.vercel.app/api/medic-signup')).toBe('https://medguard-nu.vercel.app/account?setup=password')
  })
})
