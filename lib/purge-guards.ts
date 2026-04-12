export interface PurgeCandidate {
  id: string
  exported_at: string | null
  is_test?: boolean | null
  status?: string | null
}

export interface PurgeGuardFailure {
  error: string
  status: 400 | 404
}

export interface PurgeGuardOptions {
  testFinalStatuses?: string[]
  notFoundError?: string
  blockedError?: string
}

export function validatePurgeSelection(
  requestedIds: string[],
  submissions: PurgeCandidate[],
  options: PurgeGuardOptions = {},
): PurgeGuardFailure | null {
  const testFinalStatuses = options.testFinalStatuses ?? []

  if (submissions.length !== requestedIds.length) {
    return { error: options.notFoundError ?? 'One or more declarations were not found.', status: 404 }
  }

  if (submissions.some((submission) => {
    if (submission.exported_at) return false
    return !(submission.is_test && submission.status && testFinalStatuses.includes(submission.status))
  })) {
    return {
      error: options.blockedError ?? 'All production records must be exported to PDF before purging. Reviewed test records can be purged without export.',
      status: 400,
    }
  }

  return null
}
