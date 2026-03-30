import { describe, it, expect } from 'vitest'
import { computeRiskChips } from '../risk-chips'
import type { Submission } from '../types'

function makeSubmission(overrides: Partial<Submission['worker_snapshot']> = {}): Submission {
  return {
    id: 'sub1',
    business_id: 'biz1',
    site_id: 'site1',
    worker_id: 'w1',
    role: 'Drill Operator',
    visit_date: '2025-04-12',
    shift_type: 'Day',
    status: 'New',
    consent_given: true,
    submitted_at: '2025-04-12T07:00:00Z',
    site_specific_answers: {},
    decision: null,
    exported_at: null,
    phi_purged_at: null,
    comments: [],
    worker_snapshot: {
      fullName: 'James Hartley',
      dateOfBirth: '1982-03-14',
      emailAddress: 'j@example.com',
      mobileNumber: '0400000000',
      company: 'Acme Mining',
      department: 'Pit',
      employeeId: 'E001',
      isContractor: false,
      heightCm: 180,
      weightKg: 85,
      emergencyContactName: 'Jane',
      emergencyContactMobile: '0411111111',
      allergies: '',
      anaphylactic: false,
      currentMedications: [],
      hasPrescriptions: false,
      tetanus: { immunised: true, lastDoseDate: null },
      hepatitisB: { immunised: true, lastDoseDate: null },
      conditionChecklist: {},
      ...overrides,
    },
  }
}

describe('computeRiskChips', () => {
  it('returns clear chip when no flags', () => {
    const chips = computeRiskChips(makeSubmission())
    expect(chips).toEqual([{ type: 'clear', label: 'No flags' }])
  })

  it('returns anaphylaxis chip when anaphylactic is true', () => {
    const chips = computeRiskChips(makeSubmission({ anaphylactic: true }))
    expect(chips.some(c => c.type === 'anaphylaxis')).toBe(true)
  })

  it('returns flagged-meds chip with count', () => {
    const chips = computeRiskChips(makeSubmission({
      currentMedications: [
        { id: '1', name: 'Tramadol', dosage: '50mg', frequency: 'daily', reviewFlag: 'Opioid' },
        { id: '2', name: 'Panadol', dosage: '500mg', frequency: 'prn', reviewFlag: 'None' },
      ],
    }))
    const chip = chips.find(c => c.type === 'flagged-meds')
    expect(chip).toBeDefined()
    expect(chip!.count).toBe(1)
    expect(chip!.label).toBe('⚠ 1 flagged med')
  })

  it('pluralises flagged-meds label correctly', () => {
    const chips = computeRiskChips(makeSubmission({
      currentMedications: [
        { id: '1', name: 'Tramadol', dosage: '50mg', frequency: 'daily', reviewFlag: 'Opioid' },
        { id: '2', name: 'Temazepam', dosage: '10mg', frequency: 'nocte', reviewFlag: 'Sedative / Hypnotic' },
      ],
    }))
    const chip = chips.find(c => c.type === 'flagged-meds')
    expect(chip!.label).toBe('⚠ 2 flagged meds')
  })

  it('returns conditions chip with count', () => {
    const chips = computeRiskChips(makeSubmission({
      conditionChecklist: {
        sleepApnoea: { label: 'Sleep Apnoea', answer: true, detail: 'Uses CPAP' },
        diabetes: { label: 'Diabetes', answer: false, detail: '' },
      },
    }))
    const chip = chips.find(c => c.type === 'conditions')
    expect(chip).toBeDefined()
    expect(chip!.count).toBe(1)
  })

  it('does not return clear chip when other chips present', () => {
    const chips = computeRiskChips(makeSubmission({ anaphylactic: true }))
    expect(chips.some(c => c.type === 'clear')).toBe(false)
  })

  it('returns null-snapshot as clear', () => {
    const sub = makeSubmission()
    // @ts-expect-error intentional null test
    sub.worker_snapshot = null
    const chips = computeRiskChips(sub)
    expect(chips).toEqual([{ type: 'clear', label: 'No flags' }])
  })
})
