import type { CycleSegment } from './roster-patterns'
import { cycleLengthDays } from './roster-patterns'

export type { CycleSegment }

export type SwingWindow = {
  /** 1-indexed cycle number */
  cycleNumber: number
  /** 0-indexed segment within the cycle */
  segmentIndex: number
  /** Whether this segment is on-site or R&R */
  period: 'on' | 'off'
  /** First day of this segment (inclusive) */
  startDate: Date
  /** Last day of this segment (inclusive) */
  endDate: Date
  /** True when today falls inside this window */
  isActive: boolean
  /** Display label */
  label: string
}

/**
 * Returns the number of whole calendar days between two dates.
 * Positive if b is after a.
 */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  // Normalise to midnight UTC to avoid DST issues
  const aMs = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bMs = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bMs - aMs) / msPerDay)
}

/** Add `n` calendar days to a Date, returning a new Date at midnight local */
function addDays(date: Date, n: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + n)
  return result
}

/** Returns true if `date` falls on or after `start` and before `end` (exclusive day) */
function dateInRange(date: Date, start: Date, end: Date): boolean {
  const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const s = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const e = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return d >= s && d < e
}

/**
 * Compute swing windows for display.
 *
 * @param anchorDate   First day of cycle 1 (first day of first on-site segment)
 * @param cycle        Array of {days, period} segments defining one full cycle
 * @param referenceDate The date to anchor the display around (defaults to today)
 * @param cyclesToShow How many full cycles to display (defaults to 6)
 */
export function computeSwingWindows(
  anchorDate: Date,
  cycle: CycleSegment[],
  referenceDate: Date = new Date(),
  cyclesToShow: number = 6,
): SwingWindow[] {
  if (cycle.length === 0) return []

  const totalDays = cycleLengthDays(cycle)
  if (totalDays <= 0) return []

  // Find which cycle contains referenceDate
  const daysSinceAnchor = daysBetween(anchorDate, referenceDate)
  const currentCycleNumber = Math.floor(daysSinceAnchor / totalDays) // can be negative

  // Start display from 1 cycle before current (for context), floor at 0
  const displayStartCycle = Math.max(0, currentCycleNumber - 1)

  const windows: SwingWindow[] = []

  for (let c = displayStartCycle; c < displayStartCycle + cyclesToShow; c++) {
    // Day offset of the start of this cycle from anchor
    const cycleStartOffset = c * totalDays
    let segmentOffset = 0

    for (let s = 0; s < cycle.length; s++) {
      const seg = cycle[s]
      const segStartDate = addDays(anchorDate, cycleStartOffset + segmentOffset)
      const segEndDateExclusive = addDays(segStartDate, seg.days)
      const segEndDateInclusive = addDays(segStartDate, seg.days - 1)

      const isActive = dateInRange(referenceDate, segStartDate, segEndDateExclusive)

      windows.push({
        cycleNumber: c + 1,
        segmentIndex: s,
        period: seg.period,
        startDate: segStartDate,
        endDate: segEndDateInclusive,
        isActive,
        label: seg.period === 'on' ? 'On site' : 'R&R',
      })

      segmentOffset += seg.days
    }
  }

  return windows
}

/**
 * Returns true if the worker is currently on-site on `referenceDate`.
 */
export function isOnSiteOnDate(
  anchorDate: Date,
  cycle: CycleSegment[],
  referenceDate: Date = new Date(),
): boolean {
  const totalDays = cycleLengthDays(cycle)
  if (totalDays <= 0) return false

  const daysSinceAnchor = daysBetween(anchorDate, referenceDate)

  // Handle dates before anchor (worker hasn't started yet)
  if (daysSinceAnchor < 0) return false

  const posInCycle = daysSinceAnchor % totalDays
  let cumulative = 0

  for (const seg of cycle) {
    if (posInCycle < cumulative + seg.days) {
      return seg.period === 'on'
    }
    cumulative += seg.days
  }

  return false // unreachable
}

/**
 * Returns the next date the worker flys in (enters an on-site period)
 * at or after `referenceDate`. Returns null if anchorDate is in the future
 * and referenceDate is before anchor.
 */
export function nextFlyIn(
  anchorDate: Date,
  cycle: CycleSegment[],
  referenceDate: Date = new Date(),
): Date | null {
  const totalDays = cycleLengthDays(cycle)
  if (totalDays <= 0) return null

  const daysSinceAnchor = daysBetween(anchorDate, referenceDate)

  // If before anchor, next fly-in is the anchor itself (if first seg is 'on')
  if (daysSinceAnchor < 0) {
    return cycle[0].period === 'on' ? anchorDate : null
  }

  const currentCycle = Math.floor(daysSinceAnchor / totalDays)
  const posInCycle = daysSinceAnchor % totalDays

  // Walk through the remaining segments in the current cycle
  let cumulative = 0
  for (let s = 0; s < cycle.length; s++) {
    const seg = cycle[s]
    if (posInCycle < cumulative + seg.days) {
      // We are somewhere in segment s
      if (seg.period === 'on') {
        // Already on-site — fly-in was the start of this segment
        return addDays(anchorDate, currentCycle * totalDays + cumulative)
      }
      // In an off period — next fly-in is start of next 'on' segment
      let nextCumulative = cumulative + seg.days
      for (let t = s + 1; t < cycle.length; t++) {
        if (cycle[t].period === 'on') {
          return addDays(anchorDate, currentCycle * totalDays + nextCumulative)
        }
        nextCumulative += cycle[t].days
      }
      // Not found in rest of this cycle — look at next cycle
      const nextCycleStart = (currentCycle + 1) * totalDays
      let nc = 0
      for (const nSeg of cycle) {
        if (nSeg.period === 'on') {
          return addDays(anchorDate, nextCycleStart + nc)
        }
        nc += nSeg.days
      }
      return null
    }
    cumulative += seg.days
  }

  return null
}

/**
 * Returns the next fly-out date (first day of an off period)
 * at or after `referenceDate`.
 */
export function nextFlyOut(
  anchorDate: Date,
  cycle: CycleSegment[],
  referenceDate: Date = new Date(),
): Date | null {
  const totalDays = cycleLengthDays(cycle)
  if (totalDays <= 0) return null

  const daysSinceAnchor = daysBetween(anchorDate, referenceDate)
  if (daysSinceAnchor < 0) {
    // Before anchor — check if there's an off segment after first on
    let c = 0
    for (const seg of cycle) {
      if (seg.period === 'off') return addDays(anchorDate, c)
      c += seg.days
    }
    return null
  }

  const currentCycle = Math.floor(daysSinceAnchor / totalDays)
  const posInCycle = daysSinceAnchor % totalDays

  let cumulative = 0
  for (let s = 0; s < cycle.length; s++) {
    const seg = cycle[s]
    if (posInCycle < cumulative + seg.days) {
      // In segment s — find next off segment
      if (seg.period === 'off') {
        return addDays(anchorDate, currentCycle * totalDays + cumulative)
      }
      let nextCumulative = cumulative + seg.days
      for (let t = s + 1; t < cycle.length; t++) {
        if (cycle[t].period === 'off') {
          return addDays(anchorDate, currentCycle * totalDays + nextCumulative)
        }
        nextCumulative += cycle[t].days
      }
      // Not in this cycle — check next
      const nextCycleStart = (currentCycle + 1) * totalDays
      let nc = 0
      for (const nSeg of cycle) {
        if (nSeg.period === 'off') {
          return addDays(anchorDate, nextCycleStart + nc)
        }
        nc += nSeg.days
      }
      return null
    }
    cumulative += seg.days
  }

  return null
}
