export const SURVEILLANCE_TIME_ZONE = 'Australia/Perth'

function toDate(value: string | null | undefined) {
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatInTimeZone(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback: string,
) {
  const parsed = toDate(value)
  if (!parsed) return fallback

  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: SURVEILLANCE_TIME_ZONE,
      ...options,
    }).format(parsed)
  } catch {
    return fallback
  }
}

export function formatDate(value: string | null | undefined) {
  return formatInTimeZone(
    value,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
    'No date',
  )
}

export function formatTimestamp(value: string | null | undefined) {
  return formatInTimeZone(
    value,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    'Unknown time',
  )
}

export function parseBusinessLocalDateTimeToIso(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    const parsed = toDate(trimmed)
    return parsed?.toISOString() ?? null
  }

  const parsed = toDate(`${trimmed}+08:00`)
  return parsed?.toISOString() ?? null
}
