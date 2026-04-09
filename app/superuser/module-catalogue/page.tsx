import { redirect } from 'next/navigation'
import ModuleCatalog from '@/components/superuser/ModuleCatalog'
import { createClient } from '@/lib/supabase/server'
import { getConfiguredBusinessModules } from '@/lib/modules'

export default async function SuperuserModuleCataloguePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') redirect('/')

  const modules = getConfiguredBusinessModules([], {
    surface: 'superuser_config',
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Module Catalogue</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Review the platform module lineup, readiness, and supported surfaces without changing any business settings.
        </p>
      </div>

      <ModuleCatalog
        modules={modules}
        description="Use this catalogue to review each module before enabling it for a specific business from the business detail view."
        showBusinessEnabledState={false}
      />
    </div>
  )
}
