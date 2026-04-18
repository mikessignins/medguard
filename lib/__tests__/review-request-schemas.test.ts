import { describe, expect, it } from 'vitest'
import {
  adminAuditRequestSchema,
  emergencyReviewRequestSchema,
  emergencyPurgeRequestSchema,
  fatigueReviewRequestSchema,
  medicationReviewRequestSchema,
  psychosocialPostIncidentRequestSchema,
  psychosocialReviewRequestSchema,
  submissionCommentRequestSchema,
} from '../review-request-schemas'

describe('emergencyReviewRequestSchema', () => {
  it('accepts reviewable statuses and normalises optional fields', () => {
    expect(emergencyReviewRequestSchema.parse({
      status: 'Approved',
      note: '  cleared  ',
      version: null,
    })).toEqual({
      status: 'Approved',
      note: 'cleared',
      version: undefined,
    })
  })

  it('rejects non-reviewable statuses', () => {
    expect(() => emergencyReviewRequestSchema.parse({ status: 'New' })).toThrow()
  })
})

describe('medicationReviewRequestSchema', () => {
  it('defaults review_required to false and trims comments', () => {
    expect(medicationReviewRequestSchema.parse({
      medic_review_status: 'Restricted Duties',
      medic_comments: '  monitor fatigue  ',
      medical_officer_name: '  Dr Smith  ',
      medical_officer_practice: '  Pilbara Medical  ',
    })).toEqual({
      medic_review_status: 'Restricted Duties',
      medic_comments: 'monitor fatigue',
      review_required: false,
      medical_officer_name: 'Dr Smith',
      medical_officer_practice: 'Pilbara Medical',
    })
  })

  it('rejects invalid medication review statuses', () => {
    expect(() => medicationReviewRequestSchema.parse({
      medic_review_status: 'Approved',
    })).toThrow()
  })
})

describe('fatigueReviewRequestSchema', () => {
  it('requires a valid fatigue review decision', () => {
    expect(() => fatigueReviewRequestSchema.parse({
      fitForWorkDecision: 'unknown',
    })).toThrow()
  })
})

describe('psychosocialReviewRequestSchema', () => {
  it('requires a non-empty outcome summary and defaults nextStatus', () => {
    expect(psychosocialReviewRequestSchema.parse({
      outcomeSummary: '  Worker contacted and follow-up booked.  ',
      reviewComments: '  left voicemail  ',
    })).toEqual({
      nextStatus: 'resolved',
      outcomeSummary: 'Worker contacted and follow-up booked.',
      reviewComments: 'left voicemail',
    })
  })

  it('rejects blank outcome summaries', () => {
    expect(() => psychosocialReviewRequestSchema.parse({
      outcomeSummary: '   ',
    })).toThrow()
  })
})

describe('psychosocialPostIncidentRequestSchema', () => {
  it('trims required fields and preserves validated booleans', () => {
    expect(psychosocialPostIncidentRequestSchema.parse({
      site_id: ' site-1 ',
      workerNameSnapshot: '  Jane Worker ',
      eventType: 'other',
      eventDateTime: '2026-04-06T10:30',
      natureOfExposure: '  Witnessed a major near miss. ',
      initialDefusingOffered: true,
      normalReactionsExplained: false,
      supportPersonContacted: true,
      eapReferralOffered: false,
      externalPsychologyReferralOffered: false,
      confidentialityAcknowledged: true,
    })).toEqual({
      site_id: 'site-1',
      workerNameSnapshot: 'Jane Worker',
      eventType: 'other',
      eventDateTime: '2026-04-06T10:30',
      natureOfExposure: 'Witnessed a major near miss.',
      initialDefusingOffered: true,
      normalReactionsExplained: false,
      supportPersonContacted: true,
      eapReferralOffered: false,
      externalPsychologyReferralOffered: false,
      confidentialityAcknowledged: true,
    })
  })

  it('rejects invalid post-incident event types', () => {
    expect(() => psychosocialPostIncidentRequestSchema.parse({
      site_id: 'site-1',
      workerNameSnapshot: 'Jane Worker',
      eventType: 'not_real',
      eventDateTime: '2026-04-06T10:30',
      natureOfExposure: 'Details',
      initialDefusingOffered: true,
      normalReactionsExplained: true,
      supportPersonContacted: false,
      eapReferralOffered: false,
      externalPsychologyReferralOffered: false,
      confidentialityAcknowledged: true,
    })).toThrow()
  })
})

describe('adminAuditRequestSchema', () => {
  it('trims text fields and accepts structured detail', () => {
    expect(adminAuditRequestSchema.parse({
      action: '  reassigned_user  ',
      target_name: '  Alex  ',
      detail: { reason: 'coverage' },
    })).toEqual({
      action: 'reassigned_user',
      target_name: 'Alex',
      detail: { reason: 'coverage' },
    })
  })
})

describe('submissionCommentRequestSchema', () => {
  it('requires a trimmed note', () => {
    expect(() => submissionCommentRequestSchema.parse({ note: '   ' })).toThrow()
  })
})

describe('emergencyPurgeRequestSchema', () => {
  it('deduplicates ids in bulk operations', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000'
    expect(emergencyPurgeRequestSchema.parse({
      ids: [id, id],
    })).toEqual({
      ids: [id],
    })
  })
})
