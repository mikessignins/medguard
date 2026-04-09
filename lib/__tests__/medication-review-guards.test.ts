import { describe, expect, it } from 'vitest'
import {
  isFinalMedicationReviewStatus,
  validateMedicationReviewTransition,
} from '../medication-review-guards'

describe('isFinalMedicationReviewStatus', () => {
  it('recognises final medication review outcomes', () => {
    expect(isFinalMedicationReviewStatus('Normal Duties')).toBe(true)
    expect(isFinalMedicationReviewStatus('Restricted Duties')).toBe(true)
    expect(isFinalMedicationReviewStatus('Unfit for Work')).toBe(true)
    expect(isFinalMedicationReviewStatus('In Review')).toBe(false)
  })
})

describe('validateMedicationReviewTransition', () => {
  it('allows first-time decisions from non-final states', () => {
    expect(validateMedicationReviewTransition('Pending', 'Restricted Duties')).toBeNull()
    expect(validateMedicationReviewTransition('In Review', 'Normal Duties')).toBeNull()
  })

  it('blocks changing a final medication decision to another outcome', () => {
    expect(validateMedicationReviewTransition('Restricted Duties', 'Normal Duties')).toEqual({
      error: "Cannot change outcome from terminal state 'Restricted Duties'.",
      status: 422,
    })
  })

  it('blocks reverting a final medication decision to an earlier state', () => {
    expect(validateMedicationReviewTransition('Unfit for Work', 'In Review')).toEqual({
      error: "Cannot change outcome from terminal state 'Unfit for Work'.",
      status: 422,
    })
  })

  it('blocks any write once the medication decision is final, even if the status is unchanged', () => {
    expect(validateMedicationReviewTransition('Restricted Duties', 'Restricted Duties')).toEqual({
      error: "Cannot change outcome from terminal state 'Restricted Duties'.",
      status: 422,
    })
  })
})
