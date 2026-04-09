import type { MedDecReviewStatus } from '@/lib/types'

const FINAL_MEDICATION_REVIEW_STATUSES: MedDecReviewStatus[] = [
  'Normal Duties',
  'Restricted Duties',
  'Unfit for Work',
]

export interface MedicationReviewGuardFailure {
  error: string
  status: 422
}

export function isFinalMedicationReviewStatus(status: MedDecReviewStatus): boolean {
  return FINAL_MEDICATION_REVIEW_STATUSES.includes(status)
}

export function validateMedicationReviewTransition(
  currentStatus: MedDecReviewStatus,
  _requestedStatus: MedDecReviewStatus
): MedicationReviewGuardFailure | null {
  if (isFinalMedicationReviewStatus(currentStatus)) {
    return {
      error: `Cannot change outcome from terminal state '${currentStatus}'.`,
      status: 422,
    }
  }

  return null
}
