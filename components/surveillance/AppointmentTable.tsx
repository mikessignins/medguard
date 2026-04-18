import Link from 'next/link'
import StatusBadge from '@/components/surveillance/StatusBadge'
import { formatTimestamp } from '@/lib/date-format'
import type { SurveillanceAppointmentWithRequirement } from '@/lib/surveillance/queries'

export default function AppointmentTable({
  appointments,
  emptyMessage = 'No appointments found.',
}: {
  appointments: SurveillanceAppointmentWithRequirement[]
  emptyMessage?: string
}) {
  if (appointments.length === 0) {
    return (
      <div className="surv-empty">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="surv-table">
      <table className="min-w-full divide-y divide-[var(--surv-border)] text-sm">
        <thead>
          <tr className="text-left">
            <th className="px-4 py-3 font-medium">Worker</th>
            <th className="px-4 py-3 font-medium">Requirement</th>
            <th className="px-4 py-3 font-medium">Scheduled</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--surv-border)]">
          {appointments.map((appointment) => (
            <tr key={appointment.id}>
              <td className="px-4 py-3">
                <Link href={`/surveillance/appointments/${appointment.id}`} className="font-medium hover:underline">
                  {appointment.worker_display_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-[var(--surv-muted)]">
                {appointment.requirement?.name ?? appointment.program?.name ?? 'Requirement'}
              </td>
              <td className="px-4 py-3 text-[var(--surv-muted)]">
                {formatTimestamp(appointment.scheduled_at)}
              </td>
              <td className="px-4 py-3"><StatusBadge status={appointment.status} /></td>
              <td className="px-4 py-3 text-[var(--surv-muted)]">{appointment.location ?? 'TBC'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
