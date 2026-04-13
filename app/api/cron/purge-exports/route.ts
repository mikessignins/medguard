import { NextResponse } from 'next/server'
import { createErrorId, getRequiredSecret, internalServerError, logApiError } from '@/lib/api-security'

export const runtime = 'nodejs'

// Kept as a non-destructive compatibility endpoint while deployments move away
// from time-based PHI retention. Exported health information is now removed only
// after explicit medic confirmation via /api/exports/confirm-and-purge.
export async function GET(request: Request) {
  const cronSecret = getRequiredSecret('CRON_SECRET')
  if (!cronSecret) {
    const errorId = createErrorId()
    logApiError('/api/cron/purge-exports', errorId, 'CRON_SECRET is missing')
    return internalServerError(errorId)
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    disabled: true,
    message: 'Time-based export purge is disabled. Use explicit export confirmation to remove stored health information.',
  })
}
