import type {
  SurveillanceAppointmentStatus,
  SurveillanceEnrolmentStatus,
  SurveillanceOutcomeStatus,
} from '@/lib/types'

type BadgeStatus = SurveillanceAppointmentStatus | SurveillanceEnrolmentStatus | SurveillanceOutcomeStatus

const CLASS_MAP: Record<BadgeStatus, string> = {
  active: 'bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]',
  paused: 'bg-[color:var(--surv-gold-soft)] text-[color:var(--surv-gold-text)]',
  completed: 'bg-[color:var(--surv-accent-soft)] text-[color:var(--surv-accent)]',
  removed: 'bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]',
  scheduled: 'bg-[color:var(--surv-accent-soft)] text-[color:var(--surv-accent)]',
  confirmed: 'bg-[color:var(--surv-accent-soft)] text-[color:var(--surv-accent)]',
  rescheduled: 'bg-[color:var(--surv-gold-soft)] text-[color:var(--surv-gold-text)]',
  cancelled: 'bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]',
  did_not_attend: 'bg-[color:var(--surv-red-soft)] text-[color:var(--surv-red-text)]',
  followup_required: 'bg-[color:var(--surv-gold-soft)] text-[color:var(--surv-gold-text)]',
  external_review_required: 'bg-[color:var(--surv-accent-soft)] text-[color:var(--surv-accent)]',
  temporary_restriction: 'bg-[color:var(--surv-red-soft)] text-[color:var(--surv-red-text)]',
  cleared: 'bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]',
}

function formatLabel(status: BadgeStatus) {
  return status.replaceAll('_', ' ')
}

export default function StatusBadge({ status }: { status: BadgeStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${CLASS_MAP[status]}`}>
      {formatLabel(status)}
    </span>
  )
}
