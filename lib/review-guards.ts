import type { SubmissionStatus } from '@/lib/types'

export const REVIEWABLE_STATUSES: SubmissionStatus[] = ['In Review', 'Approved', 'Requires Follow-up']

interface ReviewTransitionInput {
  currentStatus: SubmissionStatus
  requestedStatus: SubmissionStatus
  currentVersion: number
  requestedVersion?: number
}

export interface ReviewGuardFailure {
  error: string
  status: 400 | 409 | 422
  current_version?: number
}

export function validateRequestedReviewStatus(
  status: SubmissionStatus
): ReviewGuardFailure | null {
  if (!REVIEWABLE_STATUSES.includes(status)) {
    return { error: `Invalid status '${status}'.`, status: 400 }
  }

  return null
}

export function validateReviewTransition(
  input: ReviewTransitionInput
): ReviewGuardFailure | null {
  const { currentStatus, currentVersion, requestedVersion } = input

  if (requestedVersion !== undefined && currentVersion !== requestedVersion) {
    return {
      error: 'This form was updated by another user. Please refresh and try again.',
      status: 409,
      current_version: currentVersion,
    }
  }

  if (
    currentStatus === 'Approved' ||
    currentStatus === 'Requires Follow-up' ||
    currentStatus === 'Recalled'
  ) {
    return {
      error: `Cannot change status from terminal state '${currentStatus}'.`,
      status: 422,
    }
  }

  return null
}
