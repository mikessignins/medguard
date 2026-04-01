'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { UserAccount, Site } from '@/lib/types'

interface Props {
  pendingMedics: UserAccount[]
  activeMedics: UserAccount[]
  sites: Site[]
  businessId: string
}

interface ContractorForm {
  display_name: string
  email: string
  password: string
  contract_end_date: string
  site_ids: string[]
}

const EMPTY_CONTRACTOR: ContractorForm = {
  display_name: '',
  email: '',
  password: '',
  contract_end_date: '',
  site_ids: [],
}

export default function StaffManager({ pendingMedics: initialPending, activeMedics: initialActive, sites, businessId }: Props) {
  const supabase = createClient()

  const [pendingMedics, setPendingMedics] = useState(initialPending)
  const [activeMedics, setActiveMedics] = useState(initialActive)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [showSiteModal, setShowSiteModal] = useState(false)
  const [modalMedic, setModalMedic] = useState<UserAccount | null>(null)
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [contractEndDate, setContractEndDate] = useState('')
  const [isApproving, setIsApproving] = useState(false)

  const [showContractorForm, setShowContractorForm] = useState(false)
  const [contractorForm, setContractorForm] = useState<ContractorForm>(EMPTY_CONTRACTOR)
  const [contractorLoading, setContractorLoading] = useState(false)
  const [contractorError, setContractorError] = useState('')
  const [contractorSuccess, setContractorSuccess] = useState('')

  function openSiteModal(medic: UserAccount, approving: boolean) {
    setModalMedic(medic)
    setSelectedSiteIds(medic.site_ids || [])
    setContractEndDate(medic.contract_end_date || '')
    setIsApproving(approving)
    setShowSiteModal(true)
    setError('')
  }

  function toggleSite(siteId: string) {
    setSelectedSiteIds(prev =>
      prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId]
    )
  }

  function toggleContractorSite(siteId: string) {
    setContractorForm(f => ({
      ...f,
      site_ids: f.site_ids.includes(siteId)
        ? f.site_ids.filter(id => id !== siteId)
        : [...f.site_ids, siteId],
    }))
  }

  async function saveModal() {
    if (!modalMedic) return
    setLoading(modalMedic.id)
    setError('')

    const updates: Record<string, unknown> = {
      site_ids: selectedSiteIds,
      contract_end_date: contractEndDate || null,
    }

    if (isApproving) updates.role = 'medic'

    const { error: updateError } = await supabase
      .from('user_accounts')
      .update(updates)
      .eq('id', modalMedic.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(null)
      return
    }

    // Audit log — fire-and-forget, non-blocking
    fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: isApproving ? 'medic_approved' : 'site_assignment_changed',
        target_user_id: modalMedic.id,
        target_name: modalMedic.display_name,
        detail: {
          site_ids: selectedSiteIds,
          site_names: getSiteNames(selectedSiteIds),
          contract_end_date: contractEndDate || null,
        },
      }),
    }).catch(() => { /* non-blocking */ })

    const updated = { ...modalMedic, ...updates } as UserAccount

    if (isApproving) {
      setPendingMedics(prev => prev.filter(m => m.id !== modalMedic.id))
      setActiveMedics(prev => [...prev, updated])
    } else {
      setActiveMedics(prev => prev.map(m => m.id === modalMedic.id ? updated : m))
    }

    setLoading(null)
    setShowSiteModal(false)
    setModalMedic(null)
  }

  async function revokeMedic(medic: UserAccount) {
    if (!confirm(`Revoke access for ${medic.display_name}? They will be moved back to pending.`)) return
    setLoading(medic.id)
    setError('')

    const { error: updateError } = await supabase
      .from('user_accounts')
      .update({ role: 'pending_medic' })
      .eq('id', medic.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(null)
      return
    }

    fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'medic_revoked',
        target_user_id: medic.id,
        target_name: medic.display_name,
      }),
    }).catch(() => { /* non-blocking */ })

    const updated = { ...medic, role: 'pending_medic' as const }
    setActiveMedics(prev => prev.filter(m => m.id !== medic.id))
    setPendingMedics(prev => [...prev, updated])
    setLoading(null)
  }

  async function addContractorMedic(e: React.FormEvent) {
    e.preventDefault()
    setContractorLoading(true)
    setContractorError('')
    setContractorSuccess('')

    const { data, error: fnError } = await supabase.functions.invoke('create-medic', {
      body: {
        business_id: businessId,
        medic_display_name: contractorForm.display_name.trim(),
        medic_email: contractorForm.email.trim(),
        medic_password: contractorForm.password,
        site_ids: contractorForm.site_ids,
        contract_end_date: contractorForm.contract_end_date || null,
      },
    })

    setContractorLoading(false)

    if (fnError || data?.error) {
      setContractorError(fnError?.message || data?.error || 'Failed to create medic account.')
      return
    }

    setContractorSuccess(`Contractor medic account created for ${contractorForm.email}.`)

    fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'contractor_medic_created',
        target_name: contractorForm.display_name.trim(),
        detail: {
          email: contractorForm.email.trim(),
          site_names: getSiteNames(contractorForm.site_ids),
          contract_end_date: contractorForm.contract_end_date || null,
        },
      }),
    }).catch(() => { /* non-blocking */ })

    setContractorForm(EMPTY_CONTRACTOR)

    const { data: refreshed } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('business_id', businessId)
      .eq('role', 'medic')
    if (refreshed) setActiveMedics(refreshed as UserAccount[])
  }

  function getSiteNames(siteIds: string[]) {
    return siteIds.map(id => sites.find(s => s.id === id)?.name || id).filter(Boolean)
  }

  const inputCls = 'w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Staff Management</h1>
        <button
          onClick={() => { setShowContractorForm(true); setContractorError(''); setContractorSuccess('') }}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add Contractor Medic
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Pending Medics */}
      <div>
        <h2 className="text-base font-semibold text-slate-300 mb-3">
          Pending Approval
          {pendingMedics.length > 0 && (
            <span className="ml-2 text-sm font-normal text-orange-400">({pendingMedics.length} waiting)</span>
          )}
        </h2>
        {pendingMedics.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No pending medics.</p>
        ) : (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
            {pendingMedics.map((medic, i) => (
              <div
                key={medic.id}
                className={`px-5 py-4 flex items-center justify-between ${i > 0 ? 'border-t border-slate-700/50' : ''}`}
              >
                <div>
                  <p className="font-medium text-slate-100">{medic.display_name}</p>
                  <p className="text-sm text-slate-500">{medic.email}</p>
                </div>
                <button
                  onClick={() => openSiteModal(medic, true)}
                  disabled={loading === medic.id}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading === medic.id ? 'Processing...' : 'Approve'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Medics */}
      <div>
        <h2 className="text-base font-semibold text-slate-300 mb-3">
          Active Medics
          {activeMedics.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">({activeMedics.length})</span>
          )}
        </h2>
        {activeMedics.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No active medics.</p>
        ) : (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
            {activeMedics.map((medic, i) => {
              const siteNames = getSiteNames(medic.site_ids || [])
              const isContractor = !!medic.contract_end_date
              return (
                <div
                  key={medic.id}
                  className={`px-5 py-4 flex items-center justify-between gap-4 ${i > 0 ? 'border-t border-slate-700/50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-100">{medic.display_name}</p>
                      {isContractor && (
                        <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">Contractor</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{medic.email}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {siteNames.length > 0 ? (
                        siteNames.map(name => (
                          <span key={name} className="text-xs bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full">
                            {name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-600 italic">No sites assigned</span>
                      )}
                    </div>
                    {medic.contract_end_date && (
                      <p className="text-xs text-amber-500 mt-1">
                        Contract ends: {format(new Date(medic.contract_end_date), 'dd MMM yyyy')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openSiteModal(medic, false)}
                      disabled={loading === medic.id}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => revokeMedic(medic)}
                      disabled={loading === medic.id}
                      className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading === medic.id ? '...' : 'Revoke'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Site Assignment Modal */}
      {showSiteModal && modalMedic && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-1">
              {isApproving ? 'Approve Medic' : 'Edit Medic'}
            </h3>
            <p className="text-sm text-slate-500 mb-5">{modalMedic.display_name}</p>

            <div className="mb-5">
              <p className="text-sm font-medium text-slate-300 mb-2">Assign Sites</p>
              {sites.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No sites available. Add sites first.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {sites.map(site => (
                    <label key={site.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.includes(site.id)}
                        onChange={() => toggleSite(site.id)}
                        className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className="text-sm text-slate-300">
                        {site.name}
                        {site.is_office && <span className="ml-1 text-xs text-slate-500">(Office)</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Contract End Date <span className="text-slate-600 font-normal">(optional — for contractors)</span>
              </label>
              <input
                type="date"
                value={contractEndDate}
                onChange={e => setContractEndDate(e.target.value)}
                className={inputCls}
              />
            </div>

            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={saveModal}
                disabled={!!loading}
                className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : isApproving ? 'Approve & Save' : 'Save Changes'}
              </button>
              <button
                onClick={() => { setShowSiteModal(false); setModalMedic(null); setError('') }}
                disabled={!!loading}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contractor Medic Modal */}
      {showContractorForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Add Contractor Medic</h3>
            <p className="text-sm text-slate-500 mb-5">
              Create a medic account directly. Share the credentials with the contractor.
            </p>

            {contractorSuccess ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-lg">
                  {contractorSuccess}
                </div>
                <button
                  onClick={() => { setShowContractorForm(false); setContractorSuccess('') }}
                  className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={addContractorMedic} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={contractorForm.display_name}
                    onChange={e => setContractorForm(f => ({ ...f, display_name: e.target.value }))}
                    required
                    className={inputCls}
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Email *</label>
                  <input
                    type="email"
                    value={contractorForm.email}
                    onChange={e => setContractorForm(f => ({ ...f, email: e.target.value }))}
                    required
                    className={inputCls}
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    value={contractorForm.password}
                    onChange={e => setContractorForm(f => ({ ...f, password: e.target.value }))}
                    required
                    minLength={8}
                    className={inputCls}
                    placeholder="Min 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Contract End Date <span className="text-slate-600 font-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={contractorForm.contract_end_date}
                    onChange={e => setContractorForm(f => ({ ...f, contract_end_date: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-400 mb-2">Assign Sites</p>
                  {sites.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No sites available.</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {sites.map(site => (
                        <label key={site.id} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={contractorForm.site_ids.includes(site.id)}
                            onChange={() => toggleContractorSite(site.id)}
                            className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                          />
                          <span className="text-sm text-slate-300">
                            {site.name}
                            {site.is_office && <span className="ml-1 text-xs text-slate-500">(Office)</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {contractorError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">
                    {contractorError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={contractorLoading}
                    className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                  >
                    {contractorLoading ? 'Creating...' : 'Create Account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowContractorForm(false); setContractorError('') }}
                    disabled={contractorLoading}
                    className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
