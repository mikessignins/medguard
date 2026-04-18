import AppointmentTable from '@/components/surveillance/AppointmentTable'
import { listSurveillanceAppointments } from '@/lib/surveillance/queries'

export default async function SurveillanceAppointmentsPage() {
  let data = null

  try {
    data = await listSurveillanceAppointments()
  } catch (error) {
    console.error('[surveillance/appointments] failed to load appointments', error)
  }

  if (!data) {
    return (
      <div className="surv-page">
        <div className="surv-empty">Surveillance appointments are temporarily unavailable for this account.</div>
      </div>
    )
  }

  return (
    <div className="surv-page">
      <div className="surv-header-band">
        <div>
          <p className="surv-kicker">Appointments</p>
          <h1 className="surv-title">Appointments</h1>
          <p className="surv-subtitle">Full operational appointment list for the current business.</p>
        </div>
      </div>

      <AppointmentTable appointments={data.appointments} emptyMessage="No surveillance appointments have been created yet." />
    </div>
  )
}
