import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/api-security'
import { getElapsedMilliseconds, startRequestTimer } from '@/lib/request-timing'

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  const requestId = request.headers.get('x-medguard-request-id') ?? crypto.randomUUID()
  requestHeaders.set('x-medguard-request-id', requestId)
  requestHeaders.set('x-medguard-pathname', request.nextUrl.pathname)

  const buildNextResponse = () =>
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })

  let supabaseResponse = buildNextResponse()
  const finalizeResponse = (response: NextResponse, authDurationMs: number) => {
    response.headers.set('x-medguard-request-id', requestId)
    response.headers.set('x-medguard-middleware-auth-ms', String(authDurationMs))
    response.headers.set('Server-Timing', `supabase-auth;dur=${authDurationMs}`)
    return response
  }

  const isRscRequest =
    request.headers.get('rsc') === '1' ||
    request.nextUrl.searchParams.has('_rsc')
  const isHeadRequest = request.method === 'HEAD'
  const isCronPath = request.nextUrl.pathname.startsWith('/api/cron/')
  const isApiWriteRequest =
    request.nextUrl.pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    !isCronPath

  if (isApiWriteRequest) {
    const csrfError = requireSameOrigin(request)
    if (csrfError) {
      return finalizeResponse(csrfError, 0)
    }
  }

  if (isCronPath) {
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return finalizeResponse(
        NextResponse.json({ error: 'Server cron secret is not configured.' }, { status: 500 }),
        0,
      )
    }

    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return finalizeResponse(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        0,
      )
    }

    return finalizeResponse(supabaseResponse, 0)
  }

  // Router-driven RSC navigations and HEAD probes are already protected by the
  // target server component/layout, so we can skip the middleware auth fetch and
  // avoid paying the extra Supabase round-trip on every tab switch.
  if (isRscRequest || isHeadRequest) {
    return finalizeResponse(supabaseResponse, 0)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = buildNextResponse()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const authStartedAt = startRequestTimer()
  const { data: { user } } = await supabase.auth.getUser()
  const authDurationMs = getElapsedMilliseconds(authStartedAt)
  finalizeResponse(supabaseResponse, authDurationMs)

  const url = request.nextUrl.clone()
  const isAccountSetupLink =
    url.pathname === '/account' &&
    (url.searchParams.has('code') || url.searchParams.get('setup') === 'password')
  const isPublicPath =
    url.pathname === '/login' ||
    url.pathname === '/staff-signup' ||
    url.pathname === '/medic-signup' ||
    url.pathname === '/occ-health-signup' ||
    url.pathname === '/api/staff-signup' ||
    url.pathname === '/api/medic-signup' ||
    url.pathname === '/api/occ-health-signup' ||
    isAccountSetupLink ||
    url.pathname === '/'

  if (!user && !isPublicPath) {
    url.pathname = '/login'
    return finalizeResponse(NextResponse.redirect(url), authDurationMs)
  }

  return supabaseResponse
}
