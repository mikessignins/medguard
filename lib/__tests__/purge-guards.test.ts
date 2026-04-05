import { describe, expect, it } from 'vitest'
import { validatePurgeSelection } from '../purge-guards'

describe('validatePurgeSelection', () => {
  it('rejects purge requests when any submission is missing', () => {
    expect(validatePurgeSelection(
      ['sub-1', 'sub-2'],
      [{ id: 'sub-1', exported_at: '2026-04-05T10:00:00.000Z' }],
    )).toEqual({
      error: 'One or more declarations were not found.',
      status: 404,
    })
  })

  it('rejects purge requests until every submission has been exported', () => {
    expect(validatePurgeSelection(
      ['sub-1', 'sub-2'],
      [
        { id: 'sub-1', exported_at: '2026-04-05T10:00:00.000Z' },
        { id: 'sub-2', exported_at: null },
      ],
    )).toEqual({
      error: 'All declarations must be exported to PDF before purging.',
      status: 400,
    })
  })

  it('allows purge requests when every submission exists and is exported', () => {
    expect(validatePurgeSelection(
      ['sub-1', 'sub-2'],
      [
        { id: 'sub-1', exported_at: '2026-04-05T10:00:00.000Z' },
        { id: 'sub-2', exported_at: '2026-04-05T11:00:00.000Z' },
      ],
    )).toBeNull()
  })
})
