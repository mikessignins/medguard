import { redirect } from 'next/navigation'

export default function MedicSignupRedirectPage() {
  redirect('/staff-signup?role=medic')
}
