import Link from 'next/link'
import { notFound } from 'next/navigation'
import EligibleWorkerList from '@/components/surveillance/EligibleWorkerList'
import {
  listSurveillanceWorkerQueue,
  type SurveillanceQueueKind,
  type SurveillanceQueueSummary,
} from '@/lib/surveillance/queries'

const QUEUE_META: Record<Exclude<SurveillanceQueueKind, 'all'>, { title: string; description: string }> = {
  overdue: { title: 'Overdue', description: 'Workers already past their due date. Schedule these first when they are on site.' },
  baseline: { title: 'Needs baseline', description: 'Workers who cannot be marked current until their first assessment is arranged.' },
  'due-soon': { title: 'Due soon', description: 'Workers with a due requirement inside the 30-day planning window.' },
  'review-tasks': { title: 'Admin reviews', description: 'New starter, role change, transfer, and self-declared surveillance reviews.' },
  availability: { title: 'Cannot book', description: 'Workers with leave, training, R&R, or another availability issue blocking scheduling.' },
}

function buildQueueHref(queue: Exclude<SurveillanceQueueKind, 'all'>, search?: string) {
  const params = new URLSearchParams()
  if (search?.trim()) params.set('q', search.trim())
  const query = params.toString()
  return query ? `/surveillance/queues/${queue}?${query}` : `/surveillance/queues/${queue}`
}

function getQueueCount(data: { queueSummary: SurveillanceQueueSummary }, queue: Exclude<SurveillanceQueueKind, 'all'>) {
  switch (queue) {
    case 'overdue':
      return data.queueSummary.overdue
    case 'baseline':
      return data.queueSummary.baseline
    case 'due-soon':
      return data.queueSummary.dueSoon
    case 'review-tasks':
      return data.queueSummary.reviewTasks
    case 'availability':
      return data.queueSummary.availability
    default:
      return 0
  }
}

export default async function SurveillanceQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ queue: string }>
  searchParams?: Promise<{ q?: string }>
}) {
  const { queue } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  if (!(queue in QUEUE_META)) notFound()

  const queueKind = queue as Exclude<SurveillanceQueueKind, 'all'>
  const data = await listSurveillanceWorkerQueue(queueKind, resolvedSearchParams?.q)

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">This surveillance queue is temporarily unavailable for this account.</div>
      </div>
    )
  }

  const meta = QUEUE_META[queueKind]

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <Link href="/surveillance/workers" className="text-sm font-medium text-[var(--surv-accent)] hover:underline">
            Back to worker queue
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--surv-text)]">{meta.title}</h1>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">{meta.description}</p>
        </div>

        <form className="flex w-full max-w-md gap-2">
          <input
            name="q"
            defaultValue={resolvedSearchParams?.q ?? ''}
            placeholder="Search workers or roles"
            className="surv-input"
          />
          <button type="submit" className="surv-btn-primary">Search</button>
        </form>
      </div>

      <div className="surv-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--surv-muted)]">
            Showing {data.workers.length} worker{data.workers.length === 1 ? '' : 's'} in this queue.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(QUEUE_META) as Array<Exclude<SurveillanceQueueKind, 'all'>>).map((item) => (
              <Link key={item} href={buildQueueHref(item, resolvedSearchParams?.q)} className={`surv-chip ${item === queueKind ? 'surv-chip-active' : ''}`}>
                <span>{QUEUE_META[item].title}</span>
                <span className="ml-2 rounded-full border border-current/30 px-2 py-0.5 text-[10px]">
                  {getQueueCount(data, item)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <EligibleWorkerList workers={data.workers} emptyMessage="No workers matched this queue right now." />
    </div>
  )
}
