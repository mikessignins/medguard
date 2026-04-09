import { headers } from 'next/headers'

interface TimingExtra {
  [key: string]: string | number | boolean | null | undefined
}

interface RequestTimingContext {
  pathname: string | null
  requestId: string | null
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 100) / 100
}

export function startRequestTimer(): number {
  return performance.now()
}

export function getElapsedMilliseconds(startedAt: number): number {
  return roundDuration(performance.now() - startedAt)
}

export async function getRequestTimingContext(): Promise<RequestTimingContext> {
  try {
    const headerStore = await headers()
    return {
      pathname: headerStore.get('x-medguard-pathname'),
      requestId: headerStore.get('x-medguard-request-id'),
    }
  } catch {
    return {
      pathname: null,
      requestId: null,
    }
  }
}

export async function logRequestTiming(phase: string, startedAt: number, extra: TimingExtra = {}) {
  const durationMs = getElapsedMilliseconds(startedAt)
  const { pathname, requestId } = await getRequestTimingContext()

  if (!pathname?.startsWith('/medic')) {
    return durationMs
  }

  console.info(
    JSON.stringify({
      type: 'request_timing',
      phase,
      duration_ms: durationMs,
      pathname,
      request_id: requestId,
      ...extra,
    }),
  )

  return durationMs
}
