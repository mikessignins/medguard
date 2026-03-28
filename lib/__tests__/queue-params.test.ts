import { describe, it, expect } from 'vitest'
import { encodeQueue, parseQueue } from '../queue-params'

describe('encodeQueue', () => {
  it('encodes ids and position as URLSearchParams string', () => {
    const result = encodeQueue(['a', 'b', 'c'], 1)
    expect(result).toBe('queue=a%2Cb%2Cc&pos=1')
  })

  it('caps at 50 ids', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `id${i}`)
    const result = encodeQueue(ids, 0)
    const parsed = new URLSearchParams(result)
    expect(parsed.get('queue')!.split(',').length).toBe(50)
  })

  it('handles empty ids', () => {
    const result = encodeQueue([], 0)
    expect(result).toBe('queue=&pos=0')
  })

  it('round-trips through encodeQueue (Next.js searchParams decode)', () => {
    // Next.js decodes searchParams values before passing to server components,
    // so the encoded %2C becomes , by the time parseQueue sees it.
    const encoded = encodeQueue(['x', 'y', 'z'], 2)
    const sp = new URLSearchParams(encoded)
    const result = parseQueue({ queue: sp.get('queue')!, pos: sp.get('pos')! })
    expect(result).toEqual({ ids: ['x', 'y', 'z'], pos: 2 })
  })
})

describe('parseQueue', () => {
  it('returns ids and pos from valid params', () => {
    const result = parseQueue({ queue: 'a,b,c', pos: '1' })
    expect(result).toEqual({ ids: ['a', 'b', 'c'], pos: 1 })
  })

  it('returns null when queue param is missing', () => {
    expect(parseQueue(null)).toBeNull()
    expect(parseQueue({})).toBeNull()
  })

  it('returns null when queue is empty string', () => {
    expect(parseQueue({ queue: '' })).toBeNull()
  })

  it('defaults pos to 0 when missing', () => {
    const result = parseQueue({ queue: 'a,b' })
    expect(result).toEqual({ ids: ['a', 'b'], pos: 0 })
  })

  it('returns null when pos is not a number', () => {
    expect(parseQueue({ queue: 'a,b', pos: 'bad' })).toBeNull()
  })
})
