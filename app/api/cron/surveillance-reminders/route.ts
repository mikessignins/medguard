import { NextResponse } from 'next/server'
import {
  createErrorId,
  getRequiredSecret,
  internalServerError,
  logApiError,
} from '@/lib/api-security'
import { runSurveillanceEmailReminderCycle } from '@/lib/surveillance-email-reminders'

export async function GET(request: Request) {
  const cronSecret = getRequiredSecret('CRON_SECRET')
  if (!cronSecret) {
    const errorId = createErrorId()
    logApiError('/api/cron/surveillance-reminders', errorId, 'CRON_SECRET is missing')
    return internalServerError(errorId)
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runSurveillanceEmailReminderCycle()
    return NextResponse.json(result)
  } catch (error) {
    const errorId = createErrorId()
    logApiError(
      '/api/cron/surveillance-reminders',
      errorId,
      error instanceof Error ? error.message : 'Unknown surveillance reminder cron failure',
    )
    return internalServerError(errorId)
  }
}
