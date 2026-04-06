const DEFAULT_PAGE = 1

export function parsePageParam(value: string | undefined, fallback = DEFAULT_PAGE): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

export function getPaginationRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { from, to }
}

export function getTotalPages(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize))
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages))
}
