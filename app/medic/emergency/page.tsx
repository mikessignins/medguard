import MedicDashboard from '@/components/medic/MedicDashboard'
import { getMedicDashboardData } from '@/lib/medic-dashboard-data'

export default async function MedicEmergencyPage({ searchParams }: { searchParams: { site?: string } }) {
  const data = await getMedicDashboardData()

  return (
    <MedicDashboard
      sites={data.sites}
      submissions={data.submissions as never[]}
      medDeclarations={data.medDeclarations as never[]}
      fatigueAssessments={data.fatigueAssessments}
      medDecEnabled={data.medDecEnabled}
      fatigueEnabled={data.fatigueEnabled}
      initialSite={searchParams?.site}
      moduleView="emergency"
    />
  )
}
