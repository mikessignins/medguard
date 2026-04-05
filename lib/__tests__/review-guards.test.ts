import { describe, expect, it } from 'vitest'
import {
  REVIEWABLE_STATUSES,
  validateRequestedReviewStatus,
  validateReviewTransition,
} from '../review-guards'

describe('REVIEWABLE_STATUSES', () => {
  it('only exposes medic-manageable statuses', () => {
    expect(REVIEWABLE_STATUSES).toEqual(['In Review', 'Approved', 'Requires Follow-up'])
  })
})

describe('validateRequestedReviewStatus', () => {
  it('accepts valid medic review statuses', () => {
    expect(validateRequestedReviewStatus('Approved')).toBeNull()
    expect(validateRequestedReviewStatus('Requires Follow-up')).toBeNull()
  })

  it('rejects statuses reserved for other workflows', () => {
    expect(validateRequestedReviewStatus('New')).toEqual({
      error: "Invalid status 'New'.",
      status: 400,
    })
    expect(validateRequestedReviewStatus('Recalled')).toEqual({
      error: "Invalid status 'Recalled'.",
      status: 400,
    })
  })
})

describe('validateReviewTransition', () => {
  it('rejects stale version updates', () => {
    expect(validateReviewTransition({
      currentStatus: 'In Review',
      requestedStatus: 'Approved',
      currentVersion: 4,
      requestedVersion: 3,
    })).toEqual({
      error: 'This form was updated by another user. Please refresh and try again.',
      status: 409,
      current_version: 4,
    })
  })

  it('blocks transitions from terminal states', () => {
    expect(validateReviewTransition({
      currentStatus: 'Approved',
      requestedStatus: 'Requires Follow-up',
      currentVersion: 2,
    })).toEqual({
      error: "Cannot change status from terminal state 'Approved'.",
      status: 422,
    })
  })

  it('treats requires-follow-up as terminal once a decision is made', () => {
    expect(validateReviewTransition({
      currentStatus: 'Requires Follow-up',
      requestedStatus: 'Approved',
      currentVersion: 1,
    })).toEqual({
      error: "Cannot change status from terminal state 'Requires Follow-up'.",
      status: 422,
    })
  })

  it('allows valid in-review transitions', () => {
    expect(validateReviewTransition({
      currentStatus: 'In Review',
      requestedStatus: 'Approved',
      currentVersion: 7,
      requestedVersion: 7,
    })).toBeNull()
  })
})
