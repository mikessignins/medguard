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
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Authenticated user — at most one auth round-trip per request render
// ---------------------------------------------------------------------------

export const getRequestClient = cache(async () => {
  return createClient()
})

export const getRequestUser = cache(async () => {
  const supabase = await getRequestClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

// ---------------------------------------------------------------------------
// User account — select every field needed by layouts AND pages in one query
// ---------------------------------------------------------------------------

export const getRequestUserAccount = cache(async (userId: string) => {
  const supabase = await getRequestClient()
  const { data } = await supabase
    .from('user_accounts')
    .select('display_name, role, business_id, site_ids, contract_end_date')
    .eq('id', userId)
    .single()
  return data
})

// ---------------------------------------------------------------------------
// Business modules — one fetch shared between layout nav and page content
// ---------------------------------------------------------------------------

export const getRequestBusinessModules = cache(async (businessId: string) => {
  const supabase = await getRequestClient()
  const { data } = await supabase
    .from('business_modules')
    .select('business_id, module_key, enabled, config')
    .eq('business_id', businessId)
  return data ?? []
})
