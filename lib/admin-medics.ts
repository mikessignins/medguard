import { createClient as createServiceClient } from '@supabase/supabase-js'

function createService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function expireMedicContracts(businessId: string) {
  const service = createService()
  const now = new Date().toISOString()

  const { error } = await service
    .from('user_accounts')
    .update({ is_inactive: true })
    .eq('business_id', businessId)
    .eq('role', 'medic')
    .eq('is_inactive', false)
    .not('contract_end_date', 'is', null)
    .lt('contract_end_date', now)

  if (error) {
    throw new Error(error.message)
  }
}
