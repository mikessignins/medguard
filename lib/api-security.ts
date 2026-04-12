import { NextResponse } from 'next/server'

const CSRF_ERROR_MESSAGE = 'Cross-site request blocked'

function getExpectedOrigin(request: Request): string {
  const requestUrl = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')

  if (!forwardedHost) {
    return requestUrl.origin
  }

  const protocol = forwardedProto ?? requestUrl.protocol.replace(/:$/, '')
  return `${protocol}://${forwardedHost}`
}

function getSourceOrigin(request: Request): string | null {
  const origin = request.headers.get('origin')
  if (origin) return origin

  const referer = request.headers.get('referer')
  if (!referer) return null

  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

export function requireSameOrigin(request: Request) {
  const sourceOrigin = getSourceOrigin(request)
  if (!sourceOrigin) {
    return NextResponse.json({ error: CSRF_ERROR_MESSAGE }, { status: 403 })
  }

  if (sourceOrigin !== getExpectedOrigin(request)) {
    return NextResponse.json({ error: CSRF_ERROR_MESSAGE }, { status: 403 })
  }

  return null
}

export function getRequiredSecret(name: string, minLength = 1) {
  const value = process.env[name]
  if (!value || value.length < minLength) {
    return null
  }

  return value
}

export function createErrorId() {
  return crypto.randomUUID()
}

function sanitizeError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { message: String(error) }
  }

  const maybeError = error as {
    name?: unknown
    message?: unknown
    code?: unknown
    status?: unknown
    statusCode?: unknown
  }

  return {
    name: typeof maybeError.name === 'string' ? maybeError.name : undefined,
    message: typeof maybeError.message === 'string' ? maybeError.message : 'Unexpected server error',
    code: typeof maybeError.code === 'string' || typeof maybeError.code === 'number' ? maybeError.code : undefined,
    status: typeof maybeError.status === 'number' ? maybeError.status : undefined,
    statusCode: typeof maybeError.statusCode === 'number' ? maybeError.statusCode : undefined,
  }
}

export function logApiError(route: string, errorId: string, error: unknown) {
  console.error(`[${route}] [${errorId}]`, sanitizeError(error))
}

export function internalServerError(errorId: string) {
  return NextResponse.json(
    {
      error: 'We could not complete that request. Please try again. If it keeps happening, contact support with the error ID.',
      errorId,
    },
    { status: 500 },
  )
}

export function logAndReturnInternalError(route: string, error: unknown) {
  const errorId = createErrorId()
  logApiError(route, errorId, error)
  return internalServerError(errorId)
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, private, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
}
