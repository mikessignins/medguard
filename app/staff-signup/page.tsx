import StaffSignupForm from '@/components/auth/StaffSignupForm'

export default async function StaffSignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const role = resolvedSearchParams?.role === 'occ_health' ? 'occ_health' : 'medic'

  return <StaffSignupForm defaultRole={role} />
}
