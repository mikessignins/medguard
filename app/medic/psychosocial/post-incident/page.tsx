import { redirect } from 'next/navigation'
import PostIncidentWelfareForm from '@/components/medic/PostIncidentWelfareForm'
import { getRequestClient, getRequestUser, getRequestUserAccount } from '@/lib/supabase/request-cache'
import { getWorkerDirectoryEntriesByIds } from '@/lib/worker-account-names'

export default async function MedicPostIncidentWelfarePage({
  searchParams,
}: {
  searchParams: { site?: string }
}) {
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const account = await getRequestUserAccount(user.id)
  if (!account || account.role !== 'medic' || account.is_inactive) redirect('/')
  if (account.contract_end_date && new Date(account.contract_end_date) < new Date()) redirect('/expired')

  const supabase = await getRequestClient()
  const siteIds: string[] = account.site_ids || []
  const [{ data: sites }, { data: workersBySite }, { data: emergencyWorkers }, { data: medicationWorkers }, { data: psychosocialWorkers }] = await Promise.all([
    supabase
      .from('sites')
      .select('id,name')
      .in('id', siteIds.length ? siteIds : ['__none__'])
      .order('name', { ascending: true }),
    supabase
      .from('user_accounts')
      .select('id,display_name,email,site_ids')
      .eq('business_id', account.business_id)
      .eq('role', 'worker')
      .overlaps('site_ids', siteIds.length ? siteIds : ['__none__'])
      .order('display_name', { ascending: true }),
    supabase
      .from('submissions')
      .select('worker_id')
      .in('site_id', siteIds.length ? siteIds : ['__none__']),
    supabase
      .from('medication_declarations')
      .select('worker_id')
      .in('site_id', siteIds.length ? siteIds : ['__none__']),
    supabase
      .from('module_submissions')
      .select('worker_id')
      .eq('module_key', 'psychosocial_health')
      .in('site_id', siteIds.length ? siteIds : ['__none__']),
  ])

  const historicalWorkerIds = Array.from(new Set([
    ...((emergencyWorkers ?? []).map((row) => row.worker_id).filter(Boolean)),
    ...((medicationWorkers ?? []).map((row) => row.worker_id).filter(Boolean)),
    ...((psychosocialWorkers ?? []).map((row) => row.worker_id).filter(Boolean)),
  ]))

  const workersByHistory = historicalWorkerIds.length > 0
    ? await getWorkerDirectoryEntriesByIds(historicalWorkerIds, account.business_id)
    : []

  const workerMap = new Map<string, { id: string; display_name: string; email?: string | null; site_ids: string[] }>()
  for (const worker of [...(workersBySite ?? []), ...(workersByHistory ?? [])]) {
    workerMap.set(worker.id, worker)
  }
  const workers = Array.from(workerMap.values()).sort((a, b) => a.display_name.localeCompare(b.display_name))

  return (
    <PostIncidentWelfareForm
      sites={sites || []}
      workers={workers}
      initialSite={searchParams.site}
    />
  )
}
