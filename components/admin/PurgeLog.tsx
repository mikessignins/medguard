import PaginationControls from '@/components/PaginationControls'
import { format } from 'date-fns'

interface PurgeLogEntry {
  id: string
  submission_id: string
  worker_name: string | null
  worker_dob: string | null
  site_name: string | null
  business_id: string | null
  medic_name: string | null
  purged_at: string
  form_type: string | null
  exported_at: string | null
  exported_by_name: string | null
  export_confirmed_at: string | null
  export_confirmed_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
}

interface Props {
  logs: PurgeLogEntry[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  pathname: string
  currentSearch: string
  currentFormType: string
  showBusiness?: boolean
}

const FORM_TYPE_LABELS: Record<string, string> = {
  emergency_declaration: 'Emergency Decl.',
  medication_declaration: 'Med. Declaration',
  fatigue_assessment: 'Fatigue',
  psychosocial_support_checkin: 'Support Check-in',
  psychosocial_post_incident_welfare: 'Post-incident Welfare',
}

export default function PurgeLog({
  logs,
  totalCount,
  page,
  pageSize,
  totalPages,
  pathname,
  currentSearch,
  currentFormType,
  showBusiness = false,
}: Props) {
  const hasFormTypes = true

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Purge Log</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Permanent governance record of all PHI purges — {totalCount} {totalCount === 1 ? 'entry' : 'entries'} total
        </p>
      </div>

      {/* Filters row */}
      <form className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            name="q"
            type="text"
            placeholder="Search by worker name…"
            defaultValue={currentSearch}
            className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors w-56"
          />
        </div>

        {hasFormTypes && (
          <select
            name="form_type"
            defaultValue={currentFormType}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="all">All form types</option>
            <option value="emergency_declaration">Emergency Declarations</option>
            <option value="medication_declaration">Medication Declarations</option>
            <option value="fatigue_assessment">Fatigue Assessments</option>
            <option value="psychosocial_support_checkin">Psychosocial Support Check-ins</option>
            <option value="psychosocial_post_incident_welfare">Post-incident Welfare</option>
          </select>
        )}

        <button
          type="submit"
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
        >
          Apply
        </button>

        {(currentSearch || currentFormType !== 'all') && (
          <span className="text-sm text-slate-500">
            {totalCount} {totalCount === 1 ? 'result' : 'results'}
          </span>
        )}
      </form>

      {logs.length === 0 ? (
        <p className="text-center py-16 text-slate-600">
          {currentSearch || currentFormType !== 'all' ? 'No records match the current filters.' : 'No purge events recorded yet.'}
        </p>
      ) : (
        <>
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Worker</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date of Birth</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Site</th>
                    {hasFormTypes && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Form Type</th>}
                    {showBusiness && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Business</th>}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Audit Chain</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry, i) => {
                    const isAuto = entry.medic_name === 'Auto-purge (system)'
                    return (
                      <tr
                        key={entry.id}
                        className={`${i > 0 ? 'border-t border-slate-700/50' : ''} hover:bg-slate-700/20 transition-colors`}
                      >
                        <td className="px-4 py-3 font-medium text-slate-200">
                          {entry.worker_name ?? <span className="text-slate-600 italic">Unknown</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {entry.worker_dob
                            ? (() => { try { return format(new Date(entry.worker_dob), 'dd MMM yyyy') } catch { return entry.worker_dob } })()
                            : <span className="text-slate-600 italic">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {entry.site_name ?? <span className="text-slate-600 italic">—</span>}
                        </td>
                        {hasFormTypes && (
                          <td className="px-4 py-3">
                            {entry.form_type ? (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                entry.form_type === 'medication_declaration'
                                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              }`}>
                                {FORM_TYPE_LABELS[entry.form_type] ?? entry.form_type}
                              </span>
                            ) : (
                              <span className="text-slate-600 italic text-xs">—</span>
                            )}
                          </td>
                        )}
                        {showBusiness && (
                          <td className="px-4 py-3 text-slate-400">
                            {entry.business_id ?? <span className="text-slate-600 italic">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="space-y-1 text-xs">
                            {entry.approved_by_name && (
                              <div className="flex items-start gap-1.5">
                                <span className="text-slate-600 w-16 shrink-0">Approved</span>
                                <span className="text-slate-400">
                                  {entry.approved_by_name}
                                  {entry.approved_at && (
                                    <span className="text-slate-600 ml-1">
                                      · {(() => { try { return format(new Date(entry.approved_at), 'dd MMM yy, HH:mm') } catch { return '' } })()}
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            {entry.exported_by_name && (
                              <div className="flex items-start gap-1.5">
                                <span className="text-slate-600 w-16 shrink-0">Exported</span>
                                <span className="text-slate-400">
                                  {entry.exported_by_name}
                                  {entry.exported_at && (
                                    <span className="text-slate-600 ml-1">
                                      · {(() => { try { return format(new Date(entry.exported_at), 'dd MMM yy, HH:mm') } catch { return '' } })()}
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            {entry.export_confirmed_by_name && (
                              <div className="flex items-start gap-1.5">
                                <span className="text-slate-600 w-16 shrink-0">Confirmed</span>
                                <span className="text-slate-400">
                                  {entry.export_confirmed_by_name}
                                  {entry.export_confirmed_at && (
                                    <span className="text-slate-600 ml-1">
                                      · {(() => { try { return format(new Date(entry.export_confirmed_at), 'dd MMM yy, HH:mm') } catch { return '' } })()}
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            <div className="flex items-start gap-1.5">
                              <span className="text-slate-600 w-16 shrink-0">Purged</span>
                              <span className="text-slate-400">
                                {isAuto ? (
                                  <span className="font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">Auto</span>
                                ) : (
                                  entry.medic_name ?? <span className="italic text-slate-600">Unknown</span>
                                )}
                                <span className="text-slate-600 ml-1">
                                  · {(() => { try { return format(new Date(entry.purged_at), 'dd MMM yy, HH:mm') } catch { return entry.purged_at } })()}
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <PaginationControls
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
              pathname={pathname}
              searchParams={{
                q: currentSearch || undefined,
                form_type: currentFormType !== 'all' ? currentFormType : undefined,
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
