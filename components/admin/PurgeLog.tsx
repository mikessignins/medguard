'use client'
import { format } from 'date-fns'

interface PurgeLogEntry {
  id: string
  submission_id: string
  worker_name: string | null
  worker_dob: string | null
  site_name: string | null
  medic_name: string | null
  purged_at: string
}

interface Props {
  logs: PurgeLogEntry[]
}

export default function PurgeLog({ logs }: Props) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Purge Log</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Governance record of all PHI purges — {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="text-center py-16 text-slate-600">No purge events recorded yet.</p>
      ) : (
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Worker</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date of Birth</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Site</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Purged By</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date &amp; Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry, i) => (
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
                    <td className="px-4 py-3 text-slate-400">
                      {entry.medic_name ?? <span className="text-slate-600 italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {(() => { try { return format(new Date(entry.purged_at), 'dd MMM yyyy, HH:mm') } catch { return entry.purged_at } })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
