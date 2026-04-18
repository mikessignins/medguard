import { describe, expect, it } from 'vitest'

import { getUserFacingErrorMessage } from '@/lib/user-facing-errors'

describe('getUserFacingErrorMessage', () => {
  it('hides internal RLS recursion details', () => {
    expect(
      getUserFacingErrorMessage({
        message: 'infinite recursion detected in policy for relation "user_accounts"',
      }),
    ).toBe('We could not save your account details because account permissions need attention. Please contact support.')
  })

  it('shows a clear message when email delivery is not configured', () => {
    expect(
      getUserFacingErrorMessage({
        message: 'RESEND_API_KEY or RESEND_FROM_EMAIL is missing.',
      }),
    ).toBe('Email delivery is not configured yet. Add the Resend email settings in Vercel and try again.')
  })

  it('surfaces missing database schema objects as a migration issue', () => {
    expect(
      getUserFacingErrorMessage({
        message: 'Could not find the function public.review_emergency_submission(text, text, text, integer) in the schema cache',
      }),
    ).toBe('This environment is missing a required database migration. Apply the latest Supabase migrations and try again.')

    expect(
      getUserFacingErrorMessage({
        message: 'relation "public.submission_comments" does not exist',
      }),
    ).toBe('This environment is missing a required database migration. Apply the latest Supabase migrations and try again.')
  })

  it('uses a caller-specific fallback for unknown errors', () => {
    expect(getUserFacingErrorMessage(new Error('database exploded'), 'Please try again later.')).toBe(
      'Please try again later.',
    )
  })
})
