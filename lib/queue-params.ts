const MAX_QUEUE = 50

export function encodeQueue(ids: string[], pos: number): string {
  return new URLSearchParams({
    queue: ids.slice(0, MAX_QUEUE).join(','),
    pos: String(pos),
  }).toString()
}

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
