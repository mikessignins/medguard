import MedicDashboard from '@/components/medic/MedicDashboard'
import { getMedicDashboardData } from '@/lib/medic-dashboard-data'

export default async function MedicFatigueDashboardPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const resolvedSearchParams = await searchParams
  const data = await getMedicDashboardData('fatigue')

  return (
    <MedicDashboard
      sites={data.sites}
      submissions={data.submissions as never[]}
      medDeclarations={data.medDeclarations as never[]}
      fatigueAssessments={data.fatigueAssessments}
      medDecEnabled={data.medDecEnabled}
      fatigueEnabled={data.fatigueEnabled}
      initialSite={resolvedSearchParams?.site}
      moduleView="fatigue"
    />
  )
}
