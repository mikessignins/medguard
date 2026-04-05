import { describe, expect, it } from 'vitest'
import { parseSubmissionComment, parseSubmissionComments } from '../submission-comments'

describe('parseSubmissionComment', () => {
  it('returns a sanitised comment for valid rows', () => {
    expect(parseSubmissionComment({
      id: 'comment-1',
      medic_user_id: 'medic-1',
      medic_name: 'Taylor Medic',
      note: 'Follow up tomorrow.',
      outcome: 'Requires Follow-up',
      created_at: '2026-04-05T10:00:00.000Z',
      edited_at: null,
    })).toEqual({
      id: 'comment-1',
      medic_user_id: 'medic-1',
      medic_name: 'Taylor Medic',
      note: 'Follow up tomorrow.',
      outcome: 'Requires Follow-up',
      created_at: '2026-04-05T10:00:00.000Z',
      edited_at: null,
    })
  })

  it('rejects incomplete rows', () => {
    expect(parseSubmissionComment({
      id: 'comment-1',
      medic_name: 'Taylor Medic',
      note: 'Missing medic id',
      created_at: '2026-04-05T10:00:00.000Z',
    })).toBeNull()
  })
})

describe('parseSubmissionComments', () => {
  it('filters invalid rows and sorts comments by created_at', () => {
    expect(parseSubmissionComments([
      {
        id: 'comment-2',
        medic_user_id: 'medic-2',
        medic_name: 'Jordan Medic',
        note: 'Second note',
        created_at: '2026-04-05T12:00:00.000Z',
      },
      {
        id: 'comment-1',
        medic_user_id: 'medic-1',
        medic_name: 'Taylor Medic',
        note: 'First note',
        created_at: '2026-04-05T10:00:00.000Z',
      },
      {
        id: 'bad-row',
        medic_name: 'No user id',
        note: 'Invalid',
      },
    ])).toEqual([
      {
        id: 'comment-1',
        medic_user_id: 'medic-1',
        medic_name: 'Taylor Medic',
        note: 'First note',
        outcome: null,
        created_at: '2026-04-05T10:00:00.000Z',
        edited_at: null,
      },
      {
        id: 'comment-2',
        medic_user_id: 'medic-2',
        medic_name: 'Jordan Medic',
        note: 'Second note',
        outcome: null,
        created_at: '2026-04-05T12:00:00.000Z',
        edited_at: null,
      },
    ])
  })
})
