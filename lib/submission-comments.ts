import type { MedicComment } from '@/lib/types'

type RawComment = Record<string, unknown>

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function parseSubmissionComment(raw: unknown): MedicComment | null {
  if (!raw || typeof raw !== 'object') return null

  const row = raw as RawComment
  const id = asString(row.id)
  const medicUserId = asString(row.medic_user_id)
  const medicName = asString(row.medic_name)
  const note = asString(row.note)
  const createdAt = asString(row.created_at)

  if (!id || !medicUserId || !medicName || !note || !createdAt) return null

  return {
    id,
    medic_user_id: medicUserId,
    medic_name: medicName,
    note,
    outcome: asString(row.outcome),
    created_at: createdAt,
    edited_at: asString(row.edited_at),
  }
}

export function parseSubmissionComments(raw: unknown): MedicComment[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map(parseSubmissionComment)
    .filter((comment): comment is MedicComment => comment !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}
