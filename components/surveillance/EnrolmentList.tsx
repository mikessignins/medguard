import Link from 'next/link'
import StatusBadge from '@/components/surveillance/StatusBadge'
import { formatDate } from '@/lib/date-format'
import type { SurveillanceEnrolmentWithRequirement } from '@/lib/surveillance/queries'

export default function EnrolmentList({
  enrolments,
  emptyMessage = 'No enrolments found.',
}: {
  enrolments: SurveillanceEnrolmentWithRequirement[]
  emptyMessage?: string
}) {
  if (enrolments.length === 0) {
    return (
      <div className="surv-empty">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {enrolments.map((enrolment) => (
        <div key={enrolment.id} className="surv-card-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link href={`/surveillance/workers/${enrolment.surveillance_worker_id}`} className="text-sm font-semibold text-[var(--surv-text)] hover:underline">
                {enrolment.worker_display_name}
              </Link>
              <p className="mt-1 text-xs text-[var(--surv-muted)]">
                {enrolment.requirement?.name ?? enrolment.program?.name ?? 'Requirement'}
                {enrolment.next_due_at ? ` • due ${formatDate(enrolment.next_due_at)}` : ''}
              </p>
            </div>
            <StatusBadge status={enrolment.status} />
          </div>
        </div>
      ))}
    </div>
  )
}
