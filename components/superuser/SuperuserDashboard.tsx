'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import NewBusinessModal from './NewBusinessModal'
import type { Business } from '@/lib/types'

interface BusinessRow extends Business {
  adminCount: number
  medicCount: number
  workerCount: number
  siteCount: number
  totalDeclarations: number
  lastDeclaration: string | null
  is_suspended: boolean
}

interface Props {
  businesses: BusinessRow[]
}

export default function SuperuserDashboard({ businesses: initialBusinesses }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [businesses, setBusinesses] = useState(initialBusinesses)
  const [showModal, setShowModal] = useState(false)
  const [suspendingId, setSuspendingId] = useState<string | null>(null)

  function onBusinessCreated(newBiz: BusinessRow) {
    setBusinesses(prev => [...prev, newBiz])
    setShowModal(false)
  }

  async function toggleSuspend(biz: BusinessRow) {
    const action = biz.is_suspended ? 'unsuspend' : 'suspend'
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${biz.name}"?`)) return

    setSuspendingId(biz.id)
    const { error } = await supabase
      .from('businesses')
      .update({ is_suspended: !biz.is_suspended })
      .eq('id', biz.id)

    setSuspendingId(null)
    if (error) { alert(error.message); return }

    setBusinesses(prev =>
      prev.map(b => b.id === biz.id ? { ...b, is_suspended: !biz.is_suspended } : b)
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Businesses</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage client organisations</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New Business
        </button>
      </div>

      <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-700/50">
                <th className="text-left px-5 py-3 font-medium text-slate-400">Business</th>
                <th className="text-center px-4 py-3 font-medium text-slate-400">Admins</th>
                <th className="text-center px-4 py-3 font-medium text-slate-400">Medics</th>
                <th className="text-center px-4 py-3 font-medium text-slate-400">Workers</th>
                <th className="text-center px-4 py-3 font-medium text-slate-400">Sites</th>
                <th className="text-center px-4 py-3 font-medium text-slate-400">Declarations</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Last Declaration</th>
                <th className="text-center px-4 py-3 font-medium text-slate-400">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {businesses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-[var(--text-3)]">
                    No businesses yet.
                  </td>
                </tr>
              ) : (
                businesses.map((biz, i) => (
                  <tr
                    key={biz.id}
                    className={`hover:bg-slate-700/30 transition-colors cursor-pointer ${i > 0 ? 'border-t border-slate-700/50' : ''} ${biz.is_suspended ? 'opacity-50' : ''}`}
                    onClick={() => router.push(`/superuser/business/${biz.id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-100">{biz.name}</p>
                      <p className="text-xs text-[var(--text-3)]">{biz.id}</p>
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-300">{biz.adminCount}</td>
                    <td className="px-4 py-3.5 text-center text-slate-300">{biz.medicCount}</td>
                    <td className="px-4 py-3.5 text-center text-slate-300">{biz.workerCount}</td>
                    <td className="px-4 py-3.5 text-center text-slate-300">{biz.siteCount}</td>
                    <td className="px-4 py-3.5 text-center text-slate-300">{biz.totalDeclarations}</td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs">
                      {biz.lastDeclaration
                        ? format(new Date(biz.lastDeclaration), 'dd MMM yyyy')
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {biz.is_suspended ? (
                        <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-full font-medium">Suspended</span>
                      ) : (
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-full font-medium">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleSuspend(biz)}
                        disabled={suspendingId === biz.id}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                          biz.is_suspended
                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {suspendingId === biz.id ? '...' : biz.is_suspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <NewBusinessModal
          onClose={() => setShowModal(false)}
          onSuccess={onBusinessCreated}
        />
      )}
    </div>
  )
}
