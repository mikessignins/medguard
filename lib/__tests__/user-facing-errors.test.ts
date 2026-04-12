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

  it('uses a caller-specific fallback for unknown errors', () => {
    expect(getUserFacingErrorMessage(new Error('database exploded'), 'Please try again later.')).toBe(
      'Please try again later.',
    )
  })
})
