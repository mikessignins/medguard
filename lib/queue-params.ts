/** Maximum number of submission IDs to include in queue param to keep URLs reasonable. */
const MAX_QUEUE = 50

/**
 * Encodes a list of submission IDs and current position as a URLSearchParams string.
 * Caps at MAX_QUEUE IDs. The returned string is suitable for appending to a URL.
 */
export function encodeQueue(ids: string[], pos: number): string {
  return new URLSearchParams({
    queue: ids.slice(0, MAX_QUEUE).join(','),
    pos: String(pos),
  }).toString()
}

/**
 * Parses queue context from Next.js searchParams.
 * Expects `params.queue` to be a URL-decoded comma-separated string of IDs,
 * as provided by Next.js App Router searchParams (which decodes values automatically).
 * Returns null if params are absent or invalid.
 */
export function parseQueue(
  params: { queue?: string; pos?: string } | null | undefined
): { ids: string[]; pos: number } | null {
  if (!params?.queue) return null
  const ids = params.queue.split(',').filter(Boolean)
  if (ids.length === 0) return null
  const pos = parseInt(params.pos ?? '0', 10)
  if (isNaN(pos)) return null
  return { ids, pos }
}
