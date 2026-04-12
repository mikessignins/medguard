const DEFAULT_MESSAGE = 'Something went wrong. Please try again.'

const ERROR_MESSAGE_MAP: Array<[RegExp, string]> = [
  [
    /RESEND_API_KEY or RESEND_FROM_EMAIL is missing/i,
    'Email delivery is not configured yet. Add the Resend email settings in Vercel and try again.',
  ],
  [
    /infinite recursion detected in policy for relation "user_accounts"/i,
    'We could not save your account details because account permissions need attention. Please contact support.',
  ],
  [
    /row-level security|violates row-level security policy|permission denied/i,
    'You do not have permission to make that change. Please contact your administrator if this seems wrong.',
  ],
  [
    /invalid login credentials|invalid credentials/i,
    'The email or password is incorrect.',
  ],
  [
    /email rate limit|rate limit|too many requests/i,
    'Too many attempts were made. Please wait a few minutes and try again.',
  ],
  [
    /network|failed to fetch|fetch failed/i,
    'We could not reach MedGuard. Check your internet connection and try again.',
  ],
]

export function getErrorMessage(error: unknown): string {
  if (!error) return ''

  if (typeof error === 'string') return error

  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : ''
  }

  return ''
}

export function getUserFacingErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE) {
  const message = getErrorMessage(error)
  if (!message) return fallback

  const match = ERROR_MESSAGE_MAP.find(([pattern]) => pattern.test(message))
  if (match) return match[1]

  return fallback
}
