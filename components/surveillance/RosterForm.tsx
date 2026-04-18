'use client'

import { useState } from 'react'
import { ROSTER_PRESETS, ROSTER_GROUPS, findPreset } from '@/lib/surveillance/roster-patterns'
import type { CycleSegment } from '@/lib/surveillance/roster-patterns'
import { computeSwingWindows, isOnSiteOnDate } from '@/lib/surveillance/swing-schedule'
import { upsertSurveillanceWorkerRosterAction } from '@/lib/surveillance/actions'

const DATE_FORMAT = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDate(date: Date): string {
  return DATE_FORMAT.format(date)
}

interface ExistingRoster {
  pattern?: string | null
  shiftType?: string | null
  anchorDate?: string | null
  cycleJson?: Array<{ days: number; period: 'on' | 'off' }> | null
  sourceSystem?: string | null
  sourceRef?: string | null
}

interface Props {
  surveillanceWorkerId: string
  existingRoster: ExistingRoster | null
}

export default function RosterForm({ surveillanceWorkerId, existingRoster }: Props) {
  // Determine initial pattern key by matching existing cycle
  const initialPresetKey = existingRoster?.pattern
    ? (ROSTER_PRESETS.find((p) => p.label === existingRoster.pattern || p.key === existingRoster.pattern)?.key ?? '')
    : ''

  const [selectedPresetKey, setSelectedPresetKey] = useState(initialPresetKey)
  const [anchorDate, setAnchorDate] = useState(existingRoster?.anchorDate ?? '')
  const [shiftType, setShiftType] = useState(existingRoster?.shiftType ?? '')
  const [showSourceFields, setShowSourceFields] = useState(
    Boolean(existingRoster?.sourceSystem || existingRoster?.sourceRef),
  )

  const preset = selectedPresetKey ? findPreset(selectedPresetKey) : null
  const cycle: CycleSegment[] = preset?.cycle ?? (existingRoster?.cycleJson as CycleSegment[] | null) ?? []

  // Live swing preview
  const today = new Date()
  const anchorDateObj = anchorDate ? new Date(anchorDate + 'T00:00:00') : null
  const swingWindows =
    anchorDateObj && cycle.length > 0
      ? computeSwingWindows(anchorDateObj, cycle, today, 6)
      : []

  const onSiteNow = anchorDateObj && cycle.length > 0
    ? isOnSiteOnDate(anchorDateObj, cycle, today)
    : null

  const cycleJson = preset ? JSON.stringify(preset.cycle) : (existingRoster?.cycleJson ? JSON.stringify(existingRoster.cycleJson) : '')
  const patternLabel = preset?.label ?? existingRoster?.pattern ?? ''

  return (
    <div className="surv-card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--surv-text)]">Roster and availability</h2>
        <p className="mt-1 text-sm text-[var(--surv-muted)]">
          Record this worker&apos;s roster pattern once. The platform uses the fly-in date and cycle to
          project all future on-site and R&R windows, and will avoid scheduling
          appointments during off-site periods.
        </p>
      </div>

      <form action={upsertSurveillanceWorkerRosterAction} className="space-y-4">
        <input type="hidden" name="surveillanceWorkerId" value={surveillanceWorkerId} />
        <input type="hidden" name="rosterPattern" value={patternLabel} />
        <input type="hidden" name="rosterCycleJson" value={cycleJson} />

        {/* Pattern selector */}
        <div>
          <label htmlFor="rosterPresetKey" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
            Roster pattern <span className="text-[var(--surv-red-text)]">*</span>
          </label>
          <select
            id="rosterPresetKey"
            className="surv-input"
            value={selectedPresetKey}
            onChange={(e) => setSelectedPresetKey(e.target.value)}
            required
          >
            <option value="">Select a pattern…</option>
            {ROSTER_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {ROSTER_PRESETS.filter((p) => p.groupLabel === group).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {preset && (
            <p className="mt-1 text-xs text-[var(--surv-muted)]">
              {preset.cycle.map((s) => `${s.days}d ${s.period === 'on' ? 'on site' : 'off (R&R)'}`).join(' → ')}
              {' '}— {preset.cycle.reduce((t, s) => t + s.days, 0)}-day cycle
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Anchor / fly-in date */}
          <div>
            <label htmlFor="anchorDate" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
              Fly-in date (cycle anchor) <span className="text-[var(--surv-red-text)]">*</span>
            </label>
            <input
              id="anchorDate"
              name="anchorDate"
              type="date"
              required
              className="surv-input"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--surv-muted)]">
              First day of the first on-site swing. All future swings are calculated from this date.
            </p>
          </div>

          {/* Shift type */}
          <div>
            <label htmlFor="shiftType" className="mb-1 block text-sm font-medium text-[var(--surv-text)]">
              Shift type <span className="text-xs font-normal text-[var(--surv-muted)]">(optional)</span>
            </label>
            <input
              id="shiftType"
              name="shiftType"
              type="text"
              placeholder="Day shift, Night shift, Mixed…"
              className="surv-input"
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value)}
            />
          </div>
        </div>

        {/* Source system disclosure */}
        <div>
          <button
            type="button"
            className="text-xs text-[var(--surv-muted)] underline underline-offset-2 hover:text-[var(--surv-text)]"
            onClick={() => setShowSourceFields((v) => !v)}
          >
            {showSourceFields ? 'Hide' : 'Roster data comes from an external system?'}
          </button>
          {showSourceFields && (
            <div className="mt-3 grid gap-3 rounded-xl bg-[var(--surv-panel)] p-3 md:grid-cols-2">
              <div>
                <label htmlFor="sourceSystem" className="mb-1 block text-xs font-medium text-[var(--surv-text)]">
                  Source system
                </label>
                <input
                  id="sourceSystem"
                  name="sourceSystem"
                  type="text"
                  defaultValue={existingRoster?.sourceSystem ?? ''}
                  placeholder="e.g. SAP, Kronos, HRIS"
                  className="surv-input"
                />
              </div>
              <div>
                <label htmlFor="sourceRef" className="mb-1 block text-xs font-medium text-[var(--surv-text)]">
                  Source reference
                </label>
                <input
                  id="sourceRef"
                  name="sourceRef"
                  type="text"
                  defaultValue={existingRoster?.sourceRef ?? ''}
                  placeholder="Employee ID or roster ref"
                  className="surv-input"
                />
              </div>
            </div>
          )}
        </div>

        <button type="submit" className="surv-btn-primary">
          Save roster
        </button>
      </form>

      {/* Live swing preview */}
      {swingWindows.length > 0 && (
        <div className="border-t border-[var(--surv-border)] pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--surv-text)]">Projected swing schedule</h3>
            {onSiteNow !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  onSiteNow
                    ? 'bg-[var(--surv-green-soft)] text-[var(--surv-green-text)]'
                    : 'bg-[var(--surv-grey-soft)] text-[var(--surv-grey-text)]'
                }`}
              >
                Today: {onSiteNow ? 'On site' : 'Off site (R&R)'}
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-[var(--surv-muted)]">
            Appointments will not be suggested during off-site (R&R) periods.
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--surv-border)]">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--surv-border)] bg-[var(--surv-panel)] text-left">
                  <th className="px-3 py-2 font-medium text-[var(--surv-muted)]">Cycle</th>
                  <th className="px-3 py-2 font-medium text-[var(--surv-muted)]">Period</th>
                  <th className="px-3 py-2 font-medium text-[var(--surv-muted)]">Fly-in</th>
                  <th className="px-3 py-2 font-medium text-[var(--surv-muted)]">Fly-out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surv-border)]">
                {swingWindows.map((window, i) => (
                  <tr
                    key={i}
                    className={
                      window.isActive
                        ? 'bg-[var(--surv-accent-soft)]'
                        : 'bg-transparent'
                    }
                  >
                    <td className="px-3 py-2 text-[var(--surv-muted)]">
                      {window.segmentIndex === 0 ? `Cycle ${window.cycleNumber}` : ''}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          window.period === 'on'
                            ? 'text-[var(--surv-green-text)]'
                            : 'text-[var(--surv-muted)]'
                        }`}
                      >
                        {window.period === 'on' ? '✈ On site' : '🏠 R&R'}
                        {window.isActive && (
                          <span className="ml-1 rounded-full bg-[var(--surv-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Now
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--surv-text)]">
                      {formatDate(window.startDate)}
                    </td>
                    <td className="px-3 py-2 text-[var(--surv-text)]">
                      {formatDate(window.endDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state prompt */}
      {swingWindows.length === 0 && anchorDate === '' && (
        <p className="rounded-xl bg-[var(--surv-panel)] px-4 py-3 text-xs text-[var(--surv-muted)]">
          Select a pattern and enter a fly-in date to see the projected swing schedule.
        </p>
      )}
    </div>
  )
}
