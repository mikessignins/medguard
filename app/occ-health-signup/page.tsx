import { redirect } from 'next/navigation'

export default function OccHealthSignupRedirectPage() {
  redirect('/staff-signup?role=occ_health')
}
