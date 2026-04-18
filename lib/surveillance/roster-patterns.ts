export type CycleSegment = {
  days: number
  period: 'on' | 'off'
}

export type RosterPreset = {
  key: string
  label: string
  groupLabel: string
  cycle: CycleSegment[]
}

/**
 * Canonical mining / industrial roster pattern catalogue.
 * Each entry defines one complete cycle as a sequence of on/off segments.
 * Simple patterns have 2 segments; rolling patterns have 4+.
 */
export const ROSTER_PRESETS: RosterPreset[] = [
  // ── FIFO / DIDO weekly swing patterns ───────────────────────────────
  {
    key: '1w_1w',
    groupLabel: 'Weekly FIFO / DIDO swings',
    label: '1 week on / 1 week off',
    cycle: [
      { days: 7, period: 'on' },
      { days: 7, period: 'off' },
    ],
  },
  {
    key: '2w_2w',
    groupLabel: 'Weekly FIFO / DIDO swings',
    label: '2 weeks on / 2 weeks off',
    cycle: [
      { days: 14, period: 'on' },
      { days: 14, period: 'off' },
    ],
  },
  {
    key: '3w_1w',
    groupLabel: 'Weekly FIFO / DIDO swings',
    label: '3 weeks on / 1 week off',
    cycle: [
      { days: 21, period: 'on' },
      { days: 7, period: 'off' },
    ],
  },
  {
    key: '3w_3w',
    groupLabel: 'Weekly FIFO / DIDO swings',
    label: '3 weeks on / 3 weeks off',
    cycle: [
      { days: 21, period: 'on' },
      { days: 21, period: 'off' },
    ],
  },
  {
    key: '4w_4w',
    groupLabel: 'Weekly FIFO / DIDO swings',
    label: '4 weeks on / 4 weeks off',
    cycle: [
      { days: 28, period: 'on' },
      { days: 28, period: 'off' },
    ],
  },

  // ── Day-based patterns ───────────────────────────────────────────────
  {
    key: '5d_2d',
    groupLabel: 'Day patterns',
    label: '5 days on / 2 days off',
    cycle: [
      { days: 5, period: 'on' },
      { days: 2, period: 'off' },
    ],
  },
  {
    key: '4d_3d',
    groupLabel: 'Day patterns',
    label: '4 days on / 3 days off',
    cycle: [
      { days: 4, period: 'on' },
      { days: 3, period: 'off' },
    ],
  },
  {
    key: '8d_6d',
    groupLabel: 'Day patterns',
    label: '8 days on / 6 days off',
    cycle: [
      { days: 8, period: 'on' },
      { days: 6, period: 'off' },
    ],
  },
  {
    key: '4d_4d',
    groupLabel: 'Day patterns',
    label: '4 days on / 4 days off',
    cycle: [
      { days: 4, period: 'on' },
      { days: 4, period: 'off' },
    ],
  },

  // ── Multi-segment rolling rosters ────────────────────────────────────
  {
    key: '5d2d_4d3d',
    groupLabel: 'Rolling rosters',
    label: '5d on / 2d off / 4d on / 3d off (rolling — 14-day cycle)',
    cycle: [
      { days: 5, period: 'on' },
      { days: 2, period: 'off' },
      { days: 4, period: 'on' },
      { days: 3, period: 'off' },
    ],
  },
]

/** Unique group labels in display order */
export const ROSTER_GROUPS: string[] = [
  ...new Set(ROSTER_PRESETS.map((p) => p.groupLabel)),
]

/** Find a preset by key. Returns undefined if not found. */
export function findPreset(key: string): RosterPreset | undefined {
  return ROSTER_PRESETS.find((p) => p.key === key)
}

/** Total cycle length in days */
export function cycleLengthDays(cycle: CycleSegment[]): number {
  return cycle.reduce((sum, seg) => sum + seg.days, 0)
}

/** Human-readable summary of a cycle (e.g. "14 on / 14 off") */
export function cycleLabel(cycle: CycleSegment[]): string {
  return cycle
    .map((seg) => `${seg.days}d ${seg.period === 'on' ? 'on site' : 'off (R&R)'}`)
    .join(' → ')
}
