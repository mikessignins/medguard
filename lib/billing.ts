import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'

export interface MonthlyBillableRow {
  business_id: string
  bill_month: string
  billable_forms: number
}

function createBillingServiceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function fetchBusinessMonthlyBillables(businessId: string) {
  const service = createBillingServiceClient()

  const { data: monthlyBillables, error } = await service
    .from('business_monthly_billables')
    .select('business_id, bill_month, billable_forms')
    .eq('business_id', businessId)
    .order('bill_month', { ascending: false })

  if (error) throw error

  return (monthlyBillables ?? []) as MonthlyBillableRow[]
}

export async function fetchAllBusinessMonthlyBillables() {
  const service = createBillingServiceClient()

  const [{ data: businesses, error: businessesError }, { data: monthlyBillables, error: monthlyBillablesError }] = await Promise.all([
    service.from('businesses').select('id, name').order('name'),
    service
      .from('business_monthly_billables')
      .select('business_id, bill_month, billable_forms')
      .order('bill_month', { ascending: false }),
  ])

  if (businessesError) throw businessesError
  if (monthlyBillablesError) throw monthlyBillablesError

  return {
    businesses: businesses ?? [],
    monthlyBillables: (monthlyBillables ?? []) as MonthlyBillableRow[],
  }
}
