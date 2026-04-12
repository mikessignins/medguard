import { NextResponse } from 'next/server'
import {
  createErrorId,
  getRequiredSecret,
  internalServerError,
  logApiError,
} from '@/lib/api-security'
import { sendContractorExpiryWarnings } from '@/lib/contractor-expiry-notifications'

export async function GET(request: Request) {
  const cronSecret = getRequiredSecret('CRON_SECRET')
  if (!cronSecret) {
    const errorId = createErrorId()
    logApiError('/api/cron/contractor-expiry', errorId, 'CRON_SECRET is missing')
    return internalServerError(errorId)
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendContractorExpiryWarnings()
    return NextResponse.json(result)
  } catch (error) {
    const errorId = createErrorId()
    logApiError(
      '/api/cron/contractor-expiry',
      errorId,
      error instanceof Error ? error.message : 'Unknown contractor expiry cron failure',
    )
    return internalServerError(errorId)
  }
}
