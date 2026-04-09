import { createClient as createServiceClient } from '@supabase/supabase-js'

export interface WorkerDirectoryEntry {
  id: string
  display_name: string
  email: string | null
  site_ids: string[]
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  return createServiceClient(url, key)
}

export async function getWorkerDisplayNameById(workerId: string | null | undefined) {
  if (!workerId) return null
  const supabase = getServiceClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('user_accounts')
    .select('display_name')
    .eq('id', workerId)
    .maybeSingle()

  return data?.display_name?.trim() || null
}

export async function getWorkerDisplayNamesByIds(workerIds: string[]) {
  const ids = Array.from(new Set(workerIds.filter(Boolean)))
  if (ids.length === 0) return new Map<string, string>()

  const supabase = getServiceClient()
  if (!supabase) return new Map<string, string>()

  const { data } = await supabase
    .from('user_accounts')
    .select('id, display_name')
    .in('id', ids)

  return new Map(
    (data ?? [])
      .filter((row) => typeof row.id === 'string' && typeof row.display_name === 'string' && row.display_name.trim())
      .map((row) => [row.id as string, (row.display_name as string).trim()]),
  )
}

export async function getWorkerDirectoryEntriesByIds(
  workerIds: string[],
  businessId?: string | null,
) {
  const ids = Array.from(new Set(workerIds.filter(Boolean)))
  if (ids.length === 0) return [] as WorkerDirectoryEntry[]

  const supabase = getServiceClient()
  if (!supabase) return [] as WorkerDirectoryEntry[]

  let query = supabase
    .from('user_accounts')
    .select('id, display_name, email, site_ids')
    .eq('role', 'worker')
    .in('id', ids)

  if (businessId) query = query.eq('business_id', businessId)

  const { data } = await query.order('display_name', { ascending: true })

  return (data ?? [])
    .filter(
      (row) =>
        typeof row.id === 'string'
        && typeof row.display_name === 'string'
        && row.display_name.trim(),
    )
    .map((row) => ({
      id: row.id as string,
      display_name: (row.display_name as string).trim(),
      email: typeof row.email === 'string' ? row.email : null,
      site_ids: Array.isArray(row.site_ids)
        ? row.site_ids.filter((siteId): siteId is string => typeof siteId === 'string')
        : [],
    }))
}
