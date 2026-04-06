import { describe, expect, it } from 'vitest'
import { clampPage, getPaginationRange, getTotalPages, parsePageParam } from '../pagination'

describe('parsePageParam', () => {
  it('defaults to page 1 when missing or invalid', () => {
    expect(parsePageParam(undefined)).toBe(1)
    expect(parsePageParam('0')).toBe(1)
    expect(parsePageParam('-3')).toBe(1)
    expect(parsePageParam('bad')).toBe(1)
  })

  it('parses valid pages', () => {
    expect(parsePageParam('3')).toBe(3)
  })
})

describe('getPaginationRange', () => {
  it('returns zero-based inclusive ranges', () => {
    expect(getPaginationRange(1, 25)).toEqual({ from: 0, to: 24 })
    expect(getPaginationRange(3, 25)).toEqual({ from: 50, to: 74 })
  })
})

describe('getTotalPages', () => {
  it('always returns at least one page', () => {
    expect(getTotalPages(0, 25)).toBe(1)
  })

  it('rounds up for partial pages', () => {
    expect(getTotalPages(26, 25)).toBe(2)
  })
})

describe('clampPage', () => {
  it('keeps pages within bounds', () => {
    expect(clampPage(0, 4)).toBe(1)
    expect(clampPage(2, 4)).toBe(2)
    expect(clampPage(9, 4)).toBe(4)
  })
})
