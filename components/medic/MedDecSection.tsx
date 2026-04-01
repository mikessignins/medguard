'use client'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { MedicationDeclaration, MedDecReviewStatus } from '@/lib/types'
import { encodeQueue } from '@/lib/queue-params'

const STATUS_COLORS: Record<MedDecReviewStatus, string> = {
  'Pending': 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  'In Review': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'Normal Duties': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'Restricted Duties': 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  'Unfit for Work': 'bg-red-500/10 text-red-400 border border-red-500/20',
}

interface Props {
  medDeclarations: MedicationDeclaration[]
  siteId: string
  exportsHref?: string
}

export default function MedDecSection({ medDeclarations, siteId, exportsHref = '/medic/exports' }: Props) {
  const router = useRouter()
  const finalStatuses = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']

  const siteDecs = medDeclarations.filter((m) => m.site_id === siteId)
  const active = siteDecs.filter((m) => !m.exported_at && !m.phi_purged_at && !finalStatuses.includes(m.medic_review_status))
  const reviewed = siteDecs.filter((m) => !m.exported_at && !m.phi_purged_at && finalStatuses.includes(m.medic_review_status))
  const exported = siteDecs.filter((m) => !!m.exported_at && !m.phi_purged_at)
  const purged = siteDecs.filter((m) => !!m.phi_purged_at)
  const pendingCount = active.filter((m) => !m.medic_review_status || m.medic_review_status === 'Pending' || m.medic_review_status === 'In Review').length

  if (siteDecs.length === 0) return null

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Medication Declarations</h2>
        {pendingCount > 0 && (
          <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-semibold shrink-0">
            {pendingCount} pending
          </span>
        )}
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {active.length > 0 && (
        <div className="space-y-2 mb-6">
          {active.map((m, idx) => {
            const hasSideEffects = m.has_side_effects || m.has_recent_injury_or_illness
            return (
              <button
                key={m.id}
                onClick={() => router.push(`/medic/med-declarations/${m.id}?${encodeQueue(active.map((x) => x.id), idx)}`)}
                className="w-full text-left bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl px-5 py-4 hover:border-slate-600 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-slate-100">{m.worker_name || 'Unknown Worker'}</p>
                    {hasSideEffects && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Health flags" />}
                  </div>
                  <p className="text-sm text-slate-500">
                    {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) !== 1 ? 's' : ''}
                    {' '}&middot;{' '}
                    {(() => { try { return format(new Date(m.submitted_at), 'dd MMM yyyy') } catch { return '' } })()}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[m.medic_review_status as MedDecReviewStatus] || STATUS_COLORS.Pending}`}>
                  {m.medic_review_status || 'Pending'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {(reviewed.length > 0 || exported.length > 0 || purged.length > 0) && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-slate-200">Reviewed medication declarations have moved out of the active queue.</p>
              <p className="text-sm text-slate-500 mt-1">
                {reviewed.length} ready to export, {exported.length} exported, {purged.length} purged.
              </p>
            </div>
            <button
              onClick={() => router.push(exportsHref)}
              className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/15 transition-colors text-sm font-semibold"
            >
              Open exports
            </button>
          </div>
        </div>
      )}

      {active.length === 0 && reviewed.length === 0 && exported.length === 0 && purged.length === 0 && (
        <p className="text-center py-8 text-slate-600">No medication declarations for this site.</p>
      )}
    </div>
  )
}
