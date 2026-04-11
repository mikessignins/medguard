import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import FeedbackReview from '@/components/superuser/FeedbackReview'
import { clampPage, getPaginationRange, getTotalPages, parsePageParam } from '@/lib/pagination'
import type { FeedbackStatus } from '@/lib/types'

const PAGE_SIZE = 20
const ALL_STATUSES: Array<FeedbackStatus | 'All'> = ['All', 'Unread', 'Read', 'Planned', 'Implemented', 'Archived']

interface SearchParams {
  page?: string
  status?: string
}

export default async function SuperuserFeedbackPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') redirect('/')

  const service = createServiceClient()
  const status = ALL_STATUSES.includes((resolvedSearchParams.status as FeedbackStatus | 'All') ?? 'All')
    ? ((resolvedSearchParams.status as FeedbackStatus | 'All') ?? 'All')
    : 'All'
  const countQueries = ALL_STATUSES
    .filter((value): value is FeedbackStatus => value !== 'All')
    .map(async (value) => {
      const { count } = await service
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .eq('status', value)
      return [value, count ?? 0] as const
    })
  const [{ count: totalCount }, statusCountsEntries] = await Promise.all([
    status === 'All'
      ? service.from('feedback').select('*', { count: 'exact', head: true })
      : service.from('feedback').select('*', { count: 'exact', head: true }).eq('status', status),
    Promise.all(countQueries),
  ])
  const statusCounts = {
    Unread: 0,
    Read: 0,
    Planned: 0,
    Implemented: 0,
    Archived: 0,
    ...Object.fromEntries(statusCountsEntries),
  } satisfies Record<FeedbackStatus, number>

  const totalPages = getTotalPages(totalCount ?? 0, PAGE_SIZE)
  const page = clampPage(parsePageParam(resolvedSearchParams.page), totalPages)
  const { from, to } = getPaginationRange(page, PAGE_SIZE)
  let feedbackQuery = service
    .from('feedback')
    .select('*')
    .order('submitted_at', { ascending: false })
    .range(from, to)
  if (status !== 'All') feedbackQuery = feedbackQuery.eq('status', status)
  const { data: feedback } = await feedbackQuery

  return (
    <FeedbackReview
      items={feedback ?? []}
      currentStatus={status}
      statusCounts={statusCounts}
      totalCount={totalCount ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      totalPages={totalPages}
      pathname="/superuser/feedback"
    />
  )
}
