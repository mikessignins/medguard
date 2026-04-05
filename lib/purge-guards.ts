export interface PurgeCandidate {
  id: string
  exported_at: string | null
}

export interface PurgeGuardFailure {
  error: string
  status: 400 | 404
}

export function validatePurgeSelection(
  requestedIds: string[],
  submissions: PurgeCandidate[]
): PurgeGuardFailure | null {
  if (submissions.length !== requestedIds.length) {
    return { error: 'One or more declarations were not found.', status: 404 }
  }

  if (submissions.some((submission) => !submission.exported_at)) {
    return {
      error: 'All declarations must be exported to PDF before purging.',
      status: 400,
    }
  }

  return null
}
