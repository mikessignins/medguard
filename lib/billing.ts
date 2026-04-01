import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'

export interface BillableSubmissionRow {
  business_id: string
  submitted_at: string
  status: string
}

export interface BillableMedDecRow {
  business_id: string
  submitted_at: string
  medic_review_status: string
}

function createBillingServiceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function fetchBusinessBillableRecords(businessId: string) {
  const service = createBillingServiceClient()

  const [{ data: submissions, error: submissionsError }, { data: medDeclarations, error: medDecError }] = await Promise.all([
    service
      .from('submissions')
      .select('business_id, submitted_at, status')
      .eq('business_id', businessId)
      .neq('status', 'Recalled')
      .eq('is_test', false)
      .order('submitted_at', { ascending: false }),
    service
      .from('medication_declarations')
      .select('business_id, submitted_at, medic_review_status')
      .eq('business_id', businessId)
      .eq('is_test', false)
      .order('submitted_at', { ascending: false }),
  ])

  if (submissionsError) throw submissionsError
  if (medDecError) throw medDecError

  return {
    submissions: (submissions ?? []) as BillableSubmissionRow[],
    medDeclarations: (medDeclarations ?? []) as BillableMedDecRow[],
  }
}

export async function fetchAllBillableRecords() {
  const service = createBillingServiceClient()

  const [{ data: businesses, error: businessesError }, { data: submissions, error: submissionsError }, { data: medDeclarations, error: medDecError }] = await Promise.all([
    service.from('businesses').select('id, name').order('name'),
    service
      .from('submissions')
      .select('business_id, submitted_at, status')
      .neq('status', 'Recalled')
      .eq('is_test', false)
      .order('submitted_at', { ascending: false }),
    service
      .from('medication_declarations')
      .select('business_id, submitted_at, medic_review_status')
      .eq('is_test', false)
      .order('submitted_at', { ascending: false }),
  ])

  if (businessesError) throw businessesError
  if (submissionsError) throw submissionsError
  if (medDecError) throw medDecError

  return {
    businesses: businesses ?? [],
    submissions: (submissions ?? []) as BillableSubmissionRow[],
    medDeclarations: (medDeclarations ?? []) as BillableMedDecRow[],
  }
}
