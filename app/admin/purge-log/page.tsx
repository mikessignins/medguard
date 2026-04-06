import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import PurgeLog from '@/components/admin/PurgeLog'
import { clampPage, getPaginationRange, getTotalPages, parsePageParam } from '@/lib/pagination'

const PAGE_SIZE = 25

interface SearchParams {
  page?: string
  q?: string
  form_type?: string
}

export default async function PurgeLogPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('business_id, role')
    .eq('id', user.id)
    .single()

  if (!account || !['admin', 'superuser'].includes(account.role)) redirect('/login')

  // Use service role to bypass RLS — scoped to this business via explicit filter
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const query = (searchParams.q ?? '').trim()
  const formType = searchParams.form_type === 'emergency_declaration' || searchParams.form_type === 'medication_declaration'
    ? searchParams.form_type
    : 'all'

  let countQuery = service
    .from('purge_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', account.business_id)
  if (formType !== 'all') countQuery = countQuery.eq('form_type', formType)
  if (query) countQuery = countQuery.ilike('worker_name', `%${query}%`)
  const { count } = await countQuery

  const totalPages = getTotalPages(count ?? 0, PAGE_SIZE)
  const page = clampPage(parsePageParam(searchParams.page), totalPages)
  const { from, to } = getPaginationRange(page, PAGE_SIZE)

  let logsQuery = service
    .from('purge_audit_log')
    .select('*')
    .eq('business_id', account.business_id)
    .order('purged_at', { ascending: false })
    .range(from, to)
  if (formType !== 'all') logsQuery = logsQuery.eq('form_type', formType)
  if (query) logsQuery = logsQuery.ilike('worker_name', `%${query}%`)
  const { data: logs } = await logsQuery

  return (
    <PurgeLog
      logs={logs ?? []}
      totalCount={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      totalPages={totalPages}
      pathname="/admin/purge-log"
      currentSearch={query}
      currentFormType={formType}
    />
  )
}
