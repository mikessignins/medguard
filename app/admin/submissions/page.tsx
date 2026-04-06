import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSubmissions from '@/components/admin/AdminSubmissions'

interface DashboardRow {
  emergency_new_count: number | null
  emergency_in_review_count: number | null
  emergency_approved_count: number | null
  emergency_follow_up_count: number | null
  emergency_total_actioned: number | null
  emergency_monthly_rows: Array<{ label: string; value: number }> | null
  emergency_site_rows: Array<{ site_id: string | null; value: number }> | null
  medication_pending_count: number | null
  medication_in_review_count: number | null
  medication_reviewed_count: number | null
  medication_total_visible: number | null
  medication_monthly_rows: Array<{ label: string; value: number }> | null
  medication_site_rows: Array<{ site_id: string | null; value: number }> | null
}

export default async function AdminSubmissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, business_id')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'admin') redirect('/')

  const [{ data: dashboardRows, error: dashboardError }, { data: sites }] = await Promise.all([
    supabase.rpc('get_admin_submission_dashboard', {
      p_business_id: account.business_id,
    }),
    supabase
      .from('sites')
      .select('id, name')
      .eq('business_id', account.business_id)
      .order('name', { ascending: true }),
  ])

  if (dashboardError) {
    throw new Error(dashboardError.message)
  }

  const dashboard = (dashboardRows?.[0] ?? {}) as DashboardRow

  return (
    <AdminSubmissions
      overview={{
        emergency: {
          newCount: dashboard.emergency_new_count ?? 0,
          inReviewCount: dashboard.emergency_in_review_count ?? 0,
          approvedCount: dashboard.emergency_approved_count ?? 0,
          followUpCount: dashboard.emergency_follow_up_count ?? 0,
          totalActioned: dashboard.emergency_total_actioned ?? 0,
          monthlyRows: (dashboard.emergency_monthly_rows ?? []).map((row) => ({ label: row.label, value: row.value })),
          siteRows: (dashboard.emergency_site_rows ?? []).map((row) => ({ label: row.site_id ?? '', value: row.value })),
        },
        medication: {
          pendingCount: dashboard.medication_pending_count ?? 0,
          inReviewCount: dashboard.medication_in_review_count ?? 0,
          reviewedCount: dashboard.medication_reviewed_count ?? 0,
          totalVisible: dashboard.medication_total_visible ?? 0,
          monthlyRows: (dashboard.medication_monthly_rows ?? []).map((row) => ({ label: row.label, value: row.value })),
          siteRows: (dashboard.medication_site_rows ?? []).map((row) => ({ label: row.site_id ?? '', value: row.value })),
        },
      }}
      sites={sites ?? []}
    />
  )
}
