import Link from 'next/link'

interface Props {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  pathname: string
  searchParams?: Record<string, string | undefined>
}

function buildHref(
  pathname: string,
  searchParams: Record<string, string | undefined> | undefined,
  nextPage: number,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (!value || key === 'page') continue
    params.set(key, value)
  }
  if (nextPage > 1) params.set('page', String(nextPage))
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export default function PaginationControls({
  page,
  pageSize,
  totalCount,
  totalPages,
  pathname,
  searchParams,
}: Props) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const end = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount)
  const prevHref = buildHref(pathname, searchParams, page - 1)
  const nextHref = buildHref(pathname, searchParams, page + 1)

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Showing {start}–{end} of {totalCount}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={prevHref}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 transition-colors hover:border-slate-600"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 opacity-40">Previous</span>
        )}
        <span className="px-2">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <Link
            href={nextHref}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 transition-colors hover:border-slate-600"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 opacity-40">Next</span>
        )}
      </div>
    </div>
  )
}
