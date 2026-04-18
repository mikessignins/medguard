'use client'
import Link from 'next/link'
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
  medDeclarations: Array<Pick<
    MedicationDeclaration,
    'id' | 'site_id' | 'worker_name' | 'submitted_at' | 'medic_review_status' | 'exported_at' | 'phi_purged_at' | 'medications' | 'has_recent_injury_or_illness' | 'has_side_effects' | 'review_required' | 'medical_officer_review_required'
  >>
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
  const pendingCount = active.filter((m) => !m.medic_review_status || m.medic_review_status === 'Pending').length
  const inReviewCount = active.filter((m) => m.medic_review_status === 'In Review').length
  const activeCount = active.length

  if (siteDecs.length === 0) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-sm font-semibold text-[var(--medic-muted)] uppercase tracking-[0.22em] whitespace-nowrap">Medication Declarations</h2>
        {activeCount > 0 && (
          <span className="text-xs bg-[var(--medic-accent)] text-white px-2 py-0.5 rounded-full font-semibold shrink-0">
            {activeCount} active
          </span>
        )}
        <div className="flex-1 h-px bg-[var(--medic-border)]" />
      </div>

      {activeCount > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-violet-300">
            {pendingCount} pending
          </span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-300">
            {inReviewCount} in review
          </span>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-2 mb-6">
          {active.map((m, idx) => {
            const hasSideEffects = m.has_side_effects || m.has_recent_injury_or_illness
            const requiresMedicalOfficerReview = m.medical_officer_review_required || m.review_required
            return (
              <Link
                key={m.id}
                href={`/medic/med-declarations/${m.id}?${encodeQueue(active.map((x) => x.id), idx)}`}
                className="medic-list-row rounded-[24px] border bg-[var(--medic-card)] border-[var(--medic-border)] hover:border-[var(--brand-primary-border)]"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-[var(--medic-text)]">{m.worker_name || 'Unknown Worker'}</p>
                    {hasSideEffects && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Health flags" />}
                    {requiresMedicalOfficerReview && (
                      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                        MRO review
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--medic-muted)]">
                    {m.medications?.length ?? 0} medication{(m.medications?.length ?? 0) !== 1 ? 's' : ''}
                    {' '}&middot;{' '}
                    {(() => { try { return format(new Date(m.submitted_at), 'dd MMM yyyy') } catch { return '' } })()}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[m.medic_review_status as MedDecReviewStatus] || STATUS_COLORS.Pending}`}>
                  {m.medic_review_status || 'Pending'}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {(reviewed.length > 0 || exported.length > 0 || purged.length > 0) && (
        <div className="rounded-[24px] border border-[var(--medic-border)] bg-[var(--medic-card-soft)] px-4 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-[var(--medic-text)]">Reviewed medication declarations have moved out of the active queue.</p>
              <p className="mt-1 text-sm text-[var(--medic-muted)]">
                {reviewed.length} ready to export, {exported.length} exported, {purged.length} purged.
              </p>
            </div>
            <button
              onClick={() => router.push(exportsHref)}
              className="rounded-full border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-4 py-2 text-sm font-semibold text-[var(--medic-text)] transition-colors hover:bg-[rgba(95,186,174,0.18)]"
            >
              Open exports
            </button>
          </div>
        </div>
      )}

      {active.length === 0 && reviewed.length === 0 && exported.length === 0 && purged.length === 0 && (
        <div className="medic-empty-state py-8">
          <p className="text-sm text-[var(--medic-muted)]">No medication declarations for this site.</p>
        </div>
      )}
    </div>
  )
}
