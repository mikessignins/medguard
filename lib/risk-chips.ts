import type { Submission } from './types'

/** Medication review flags that require medic attention. */
export const FLAGGED_REVIEWS = [
  'Opioid', 'Benzodiazepine', 'Antipsychotic', 'Anticoagulant',
  'Insulin / Diabetes', 'Antiepileptic', 'Sedative / Hypnotic',
  'Stimulant', 'Review Required',
]

export interface RiskChip {
  type: 'flagged-meds' | 'anaphylaxis' | 'conditions' | 'clear'
  label: string
  count?: number
}

/**
 * Computes risk indicator chips for a submission row or detail header.
 * Returns a 'clear' chip if no risk flags are present.
 */
export function computeRiskChips(sub: Submission): RiskChip[] {
  const ws = sub.worker_snapshot
  if (!ws) return [{ type: 'clear', label: 'No flags' }]

  const chips: RiskChip[] = []

  if (ws.anaphylactic) {
    chips.push({ type: 'anaphylaxis', label: '⚠ Anaphylaxis risk' })
  }

  const flaggedCount = (ws.currentMedications ?? []).filter(
    m => FLAGGED_REVIEWS.includes(m.reviewFlag)
  ).length
  if (flaggedCount > 0) {
    chips.push({
      type: 'flagged-meds',
      label: `⚠ ${flaggedCount} flagged med${flaggedCount !== 1 ? 's' : ''}`,
      count: flaggedCount,
    })
  }

  const conditionCount = Object.values(ws.conditionChecklist ?? {}).filter(
    v => v?.answer === true
  ).length
  if (conditionCount > 0) {
    chips.push({
      type: 'conditions',
      label: `${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`,
      count: conditionCount,
    })
  }

  if (chips.length === 0) {
    chips.push({ type: 'clear', label: 'No flags' })
  }

  return chips
}
