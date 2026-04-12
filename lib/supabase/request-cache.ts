/**
 * React `cache()` wrappers for Supabase queries that are called by both layouts
 * and page-level server components in the same request.
 *
 * React cache() deduplicates calls with identical arguments within a single
 * server-component render tree (layout + page rendered together). Without this,
 * supabase.auth.getUser() and user_accounts / business_modules queries would each
 * fire twice per tab navigation — once from the layout and once from the page.
 */

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { logRequestTiming, startRequestTimer } from '@/lib/request-timing'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Authenticated user — at most one auth round-trip per request render
// ---------------------------------------------------------------------------

export const getRequestClient = cache(async () => {
  return createClient()
})

export const getRequestUser = cache(async () => {
  const startedAt = startRequestTimer()
  const supabase = await getRequestClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claimUserId = claimsData?.claims?.sub

  if (!claimsError && typeof claimUserId === 'string' && claimUserId.length > 0) {
    await logRequestTiming('request_user', startedAt, {
      authenticated: true,
      source: 'claims',
    })
    return { id: claimUserId }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  await logRequestTiming('request_user', startedAt, {
    authenticated: Boolean(user),
    source: 'getUser',
  })
  return user
})

// ---------------------------------------------------------------------------
// User account — select every field needed by layouts AND pages in one query
// ---------------------------------------------------------------------------

export const getRequestUserAccount = cache(async (userId: string) => {
  const startedAt = startRequestTimer()
  const supabase = await getRequestClient()
  const { data } = await supabase
    .from('user_accounts')
    .select('display_name, role, business_id, superuser_scope, site_ids, contract_end_date, is_inactive')
    .eq('id', userId)
    .single()
  await logRequestTiming('request_user_account', startedAt, {
    found: Boolean(data),
  })
  return data
})

// ---------------------------------------------------------------------------
// Business modules — one fetch shared between layout nav and page content
// ---------------------------------------------------------------------------

export const getRequestBusinessModules = cache(async (businessId: string) => {
  const startedAt = startRequestTimer()
  const loadBusinessModules = unstable_cache(
    async () => {
      const supabase = await getRequestClient()
      const { data } = await supabase
        .from('business_modules')
        .select('business_id, module_key, enabled, config')
        .eq('business_id', businessId)
      return data ?? []
    },
    ['business-modules', businessId],
    {
      revalidate: 60,
      tags: [`business-modules:${businessId}`],
    },
  )
  const data = await loadBusinessModules()
  await logRequestTiming('request_business_modules', startedAt, {
    module_count: data?.length ?? 0,
  })
  return data ?? []
})

export const getRequestBusiness = cache(async (businessId: string) => {
  const startedAt = startRequestTimer()
  const loadBusiness = unstable_cache(
    async () => {
      const supabase = await getRequestClient()
      const { data } = await supabase
        .from('businesses')
        .select('name, logo_url, logo_url_light, logo_url_dark, is_suspended')
        .eq('id', businessId)
        .single()
      return data
    },
    ['business-profile', businessId],
    {
      revalidate: 60,
      tags: [`business-profile:${businessId}`],
    },
  )
  const data = await loadBusiness()
  await logRequestTiming('request_business', startedAt, {
    found: Boolean(data),
    suspended: Boolean(data?.is_suspended),
  })
  return data
})
