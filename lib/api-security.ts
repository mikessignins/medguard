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

export function logApiError(route: string, errorId: string, error: unknown) {
  console.error(`[${route}] [${errorId}]`, error)
}

export function internalServerError(errorId: string) {
  return NextResponse.json({ error: 'Internal Server Error', errorId }, { status: 500 })
}
