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
    expect(validateMedicationReviewTransition('Pending', 'In Review')).toBeNull()
    expect(validateMedicationReviewTransition('In Review', 'Restricted Duties')).toBeNull()
  })

  it('blocks changing a final medication decision to another outcome', () => {
    expect(validateMedicationReviewTransition('Restricted Duties', 'Unfit for Work')).toEqual({
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

  it('allows metadata corrections when the final outcome itself is unchanged', () => {
    expect(validateMedicationReviewTransition('Restricted Duties', 'Restricted Duties')).toBeNull()
  })
})
