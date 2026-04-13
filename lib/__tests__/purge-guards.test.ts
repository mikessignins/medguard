import { describe, expect, it } from 'vitest'
import { validatePurgeSelection } from '../purge-guards'

describe('validatePurgeSelection', () => {
  it('rejects purge requests when any submission is missing', () => {
    expect(validatePurgeSelection(
      ['sub-1', 'sub-2'],
      [{ id: 'sub-1', exported_at: '2026-04-05T10:00:00.000Z', export_confirmed_at: '2026-04-05T10:02:00.000Z' }],
    )).toEqual({
      error: 'One or more declarations were not found.',
      status: 404,
    })
  })

  it('rejects purge requests until every production submission has been exported and confirmed', () => {
    expect(validatePurgeSelection(
      ['sub-1', 'sub-2'],
      [
        { id: 'sub-1', exported_at: '2026-04-05T10:00:00.000Z', export_confirmed_at: null },
        { id: 'sub-2', exported_at: null },
      ],
    )).toEqual({
      error: 'All production records must be exported and confirmed before health information can be purged. Reviewed test records can be purged without export.',
      status: 400,
    })
  })

  it('allows reviewed test records to be purged before export', () => {
    expect(validatePurgeSelection(
      ['sub-1', 'sub-2'],
      [
        { id: 'sub-1', exported_at: '2026-04-05T10:00:00.000Z', export_confirmed_at: '2026-04-05T10:02:00.000Z' },
        { id: 'sub-2', exported_at: null, is_test: true, status: 'Approved' },
      ],
      { testFinalStatuses: ['Approved', 'Requires Follow-up'] },
    )).toBeNull()
  })

  it('rejects test records that are not reviewed yet', () => {
    expect(validatePurgeSelection(
      ['sub-1'],
      [{ id: 'sub-1', exported_at: null, is_test: true, status: 'In Review' }],
      { testFinalStatuses: ['Approved', 'Requires Follow-up'] },
    )).toEqual({
      error: 'All production records must be exported and confirmed before health information can be purged. Reviewed test records can be purged without export.',
      status: 400,
    })
  })

  it('allows purge requests when every production submission exists and is export-confirmed', () => {
    expect(validatePurgeSelection(
      ['sub-1', 'sub-2'],
      [
        { id: 'sub-1', exported_at: '2026-04-05T10:00:00.000Z', export_confirmed_at: '2026-04-05T10:02:00.000Z' },
        { id: 'sub-2', exported_at: '2026-04-05T11:00:00.000Z', export_confirmed_at: '2026-04-05T11:02:00.000Z' },
      ],
    )).toBeNull()
  })
})
