'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { UserAccount, Site } from '@/lib/types'

interface Props {
  pendingMedics: UserAccount[]
  activeMedics: UserAccount[]
  inactiveMedics: UserAccount[]
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

interface ContractorAccountResult {
  display_name: string
  email: string
  password: string
  contract_end_date: string | null
  site_names: string[]
}

interface PasswordResetForm {
  password: string
  confirmPassword: string
}

const EMPTY_CONTRACTOR: ContractorForm = {
  display_name: '',
  email: '',
  password: '',
  contract_end_date: '',
  site_ids: [],
}

const EMPTY_PASSWORD_RESET: PasswordResetForm = {
  password: '',
  confirmPassword: '',
}

export default function StaffManager({
  pendingMedics: initialPending,
  activeMedics: initialActive,
  inactiveMedics: initialInactive,
  sites,
  businessId,
}: Props) {
  const supabase = createClient()

  const [pendingMedics, setPendingMedics] = useState(initialPending)
  const [activeMedics, setActiveMedics] = useState(initialActive)
  const [inactiveMedics, setInactiveMedics] = useState(initialInactive)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

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
  const [contractorResult, setContractorResult] = useState<ContractorAccountResult | null>(null)
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
  const [resetPasswordMedic, setResetPasswordMedic] = useState<UserAccount | null>(null)
  const [resetPasswordForm, setResetPasswordForm] = useState<PasswordResetForm>(EMPTY_PASSWORD_RESET)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [resetPasswordError, setResetPasswordError] = useState('')

  function openSiteModal(medic: UserAccount, approving: boolean) {
    setModalMedic(medic)
    setSelectedSiteIds(medic.site_ids || [])
    setContractEndDate(medic.contract_end_date || '')
    setIsApproving(approving)
    setShowSiteModal(true)
    setError('')
    setStatusMessage('')
  }

  function openResetPasswordModal(medic: UserAccount) {
    setResetPasswordMedic(medic)
    setResetPasswordForm(EMPTY_PASSWORD_RESET)
    setResetPasswordError('')
    setShowResetPasswordModal(true)
    setStatusMessage('')
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
    setStatusMessage('')

    const expiredContract = isExpiredContractValue(contractEndDate || null)
    const nextInactive = expiredContract ? true : modalMedic.is_inactive ?? false

    const updates: Record<string, unknown> = {
      site_ids: selectedSiteIds,
      contract_end_date: contractEndDate || null,
      is_inactive: nextInactive,
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

    if (isApproving && !nextInactive) {
      setPendingMedics(prev => prev.filter(m => m.id !== modalMedic.id))
      setActiveMedics(prev => [...prev, updated])
    } else if (isApproving && nextInactive) {
      setPendingMedics(prev => prev.filter(m => m.id !== modalMedic.id))
      setInactiveMedics(prev => [...prev, updated])
    } else {
      setActiveMedics(prev => prev.filter(m => m.id !== modalMedic.id))
      setInactiveMedics(prev => prev.filter(m => m.id !== modalMedic.id))
      if (nextInactive) {
        setInactiveMedics(prev => [...prev, updated])
      } else {
        setActiveMedics(prev => [...prev, updated])
      }
    }

    if (expiredContract) {
      setStatusMessage(`${modalMedic.display_name} has an expired contract and was moved to the inactive list.`)
    } else {
      setStatusMessage(`${modalMedic.display_name} was updated.`)
    }

    setLoading(null)
    setShowSiteModal(false)
    setModalMedic(null)
  }

  async function deactivateMedic(medic: UserAccount) {
    if (!confirm(`Move ${medic.display_name} to the inactive list? They can be reactivated later.`)) return
    setLoading(medic.id)
    setError('')

    const { error: updateError } = await supabase
      .from('user_accounts')
      .update({ is_inactive: true })
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
        action: 'medic_deactivated',
        target_user_id: medic.id,
        target_name: medic.display_name,
      }),
    }).catch(() => { /* non-blocking */ })

    const updated = { ...medic, is_inactive: true }
    setActiveMedics(prev => prev.filter(m => m.id !== medic.id))
    setInactiveMedics(prev => [...prev, updated])
    setStatusMessage(`${medic.display_name} was moved to the inactive list.`)
    setLoading(null)
  }

  async function reactivateMedic(medic: UserAccount) {
    if (isExpiredContractValue(medic.contract_end_date)) {
      setError(`Update ${medic.display_name}'s contract end date before reactivating them.`)
      return
    }
    if (!confirm(`Reactivate ${medic.display_name}? They will return to the active medic list.`)) return
    setLoading(medic.id)
    setError('')
    setStatusMessage('')

    const { error: updateError } = await supabase
      .from('user_accounts')
      .update({ is_inactive: false })
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
        action: 'medic_reactivated',
        target_user_id: medic.id,
        target_name: medic.display_name,
      }),
    }).catch(() => { /* non-blocking */ })

    const updated = { ...medic, is_inactive: false }
    setInactiveMedics(prev => prev.filter(m => m.id !== medic.id))
    setActiveMedics(prev => [...prev, updated])
    setStatusMessage(`${medic.display_name} was reactivated.`)
    setLoading(null)
  }

  async function resetMedicPassword() {
    if (!resetPasswordMedic) return
    setResetPasswordError('')
    setError('')
    setStatusMessage('')

    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setResetPasswordError('Passwords do not match.')
      return
    }

    if (resetPasswordForm.password.length < 8) {
      setResetPasswordError('Temporary password must be at least 8 characters.')
      return
    }

    setResetPasswordLoading(true)

    try {
      const response = await fetch(`/api/admin/medics/${resetPasswordMedic.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPasswordForm.password }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setResetPasswordError(payload.error || 'Failed to reset medic password.')
        return
      }

      fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'medic_password_reset',
          target_user_id: resetPasswordMedic.id,
          target_name: resetPasswordMedic.display_name,
        }),
      }).catch(() => { /* non-blocking */ })

      setShowResetPasswordModal(false)
      setStatusMessage(
        `Temporary password reset for ${resetPasswordMedic.display_name}. Share the new password with them directly.`,
      )
      setResetPasswordMedic(null)
      setResetPasswordForm(EMPTY_PASSWORD_RESET)
    } catch {
      setResetPasswordError('Could not reach the server. Please try again.')
    } finally {
      setResetPasswordLoading(false)
    }
  }

  async function addContractorMedic(e: React.FormEvent) {
    e.preventDefault()
    setContractorLoading(true)
    setContractorError('')
    setContractorSuccess('')

    try {
      const response = await fetch('/api/admin/contractor-medics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: contractorForm.display_name.trim(),
          email: contractorForm.email.trim(),
          password: contractorForm.password,
          site_ids: contractorForm.site_ids,
          contract_end_date: contractorForm.contract_end_date || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setContractorError(payload.error || 'Failed to create medic account.')
        return
      }

      setActiveMedics(prev => [
        ...prev,
        {
          id: payload.user.id,
          business_id: businessId,
          display_name: contractorForm.display_name.trim(),
          email: contractorForm.email.trim(),
          role: 'medic',
          site_ids: contractorForm.site_ids,
          contract_end_date: contractorForm.contract_end_date || null,
          is_inactive: false,
        },
      ])
    } catch {
      setContractorError('Could not reach the server. Please try again.')
      return
    } finally {
      setContractorLoading(false)
    }

    setContractorSuccess(`Contractor medic account created for ${contractorForm.email}.`)
    setStatusMessage(`Contractor medic account created for ${contractorForm.display_name}.`)
    setContractorResult({
      display_name: contractorForm.display_name.trim(),
      email: contractorForm.email.trim(),
      password: contractorForm.password,
      contract_end_date: contractorForm.contract_end_date || null,
      site_names: getSiteNames(contractorForm.site_ids),
    })

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
  }

  function getSiteNames(siteIds: string[]) {
    return siteIds.map(id => sites.find(s => s.id === id)?.name || id).filter(Boolean)
  }

  function isExpiredContractValue(contractEndDate: string | null | undefined) {
    if (!contractEndDate) return false
    const expiry = new Date(`${contractEndDate}T23:59:59`)
    return expiry.getTime() < Date.now()
  }

  const inputCls = 'w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Staff Management</h1>
        <button
          onClick={() => {
            setShowContractorForm(true)
            setContractorError('')
            setContractorSuccess('')
            setContractorResult(null)
          }}
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

      {statusMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-lg">
          {statusMessage}
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
              const hasExpiredContract = isExpiredContractValue(medic.contract_end_date)
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
                      {hasExpiredContract && (
                        <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Expired Contract</span>
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
                      onClick={() => openResetPasswordModal(medic)}
                      disabled={loading === medic.id}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => openSiteModal(medic, false)}
                      disabled={loading === medic.id}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deactivateMedic(medic)}
                      disabled={loading === medic.id}
                      className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading === medic.id ? '...' : 'Deactivate'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Inactive Medics */}
      <div>
        <h2 className="text-base font-semibold text-slate-300 mb-3">
          Inactive Medics
          {inactiveMedics.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">({inactiveMedics.length})</span>
          )}
        </h2>
        {inactiveMedics.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No inactive medics.</p>
        ) : (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
            {inactiveMedics.map((medic, i) => {
              const siteNames = getSiteNames(medic.site_ids || [])
              const isContractor = !!medic.contract_end_date
              const hasExpiredContract = isExpiredContractValue(medic.contract_end_date)
              return (
                <div
                  key={medic.id}
                  className={`px-5 py-4 flex items-center justify-between gap-4 ${i > 0 ? 'border-t border-slate-700/50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-100">{medic.display_name}</p>
                      <span className="text-xs bg-slate-700/70 text-slate-300 border border-slate-600/60 px-2 py-0.5 rounded-full">Inactive</span>
                      {isContractor && (
                        <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">Contractor</span>
                      )}
                      {hasExpiredContract && (
                        <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Expired Contract</span>
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
                      onClick={() => openResetPasswordModal(medic)}
                      disabled={loading === medic.id}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => openSiteModal(medic, false)}
                      disabled={loading === medic.id}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => reactivateMedic(medic)}
                      disabled={loading === medic.id}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading === medic.id ? '...' : 'Reactivate'}
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
                {contractorResult && (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credentials to Share</p>
                      <p className="mt-1 text-sm text-slate-300">{contractorResult.display_name}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Email</p>
                        <p className="mt-1 text-sm font-medium text-slate-100 break-all">{contractorResult.email}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Temporary Password</p>
                        <p className="mt-1 text-sm font-medium text-slate-100 break-all">{contractorResult.password}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Assigned Sites</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {contractorResult.site_names.length > 0 ? contractorResult.site_names.join(', ') : 'No sites assigned yet'}
                      </p>
                    </div>
                    {contractorResult.contract_end_date && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Contract End Date</p>
                        <p className="mt-1 text-sm text-slate-300">
                          {format(new Date(contractorResult.contract_end_date), 'dd MMM yyyy')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setContractorSuccess('')
                      setContractorError('')
                      setContractorResult(null)
                    }}
                    className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    Create Another
                  </button>
                  <button
                    onClick={() => {
                      setShowContractorForm(false)
                      setContractorSuccess('')
                      setContractorError('')
                      setContractorResult(null)
                    }}
                    className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium text-sm transition-colors"
                  >
                    Done
                  </button>
                </div>
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
                    onClick={() => {
                      setShowContractorForm(false)
                      setContractorError('')
                      setContractorSuccess('')
                      setContractorResult(null)
                    }}
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

      {showResetPasswordModal && resetPasswordMedic && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Reset Medic Password</h3>
            <p className="text-sm text-slate-500 mb-5">
              Set a new temporary password for {resetPasswordMedic.display_name}. They can use it to sign in right away.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Temporary Password *</label>
                <input
                  type="password"
                  value={resetPasswordForm.password}
                  onChange={e => setResetPasswordForm(form => ({ ...form, password: e.target.value }))}
                  minLength={8}
                  className={inputCls}
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Confirm Temporary Password *</label>
                <input
                  type="password"
                  value={resetPasswordForm.confirmPassword}
                  onChange={e => setResetPasswordForm(form => ({ ...form, confirmPassword: e.target.value }))}
                  minLength={8}
                  className={inputCls}
                  placeholder="Re-enter password"
                />
              </div>

              {resetPasswordError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">
                  {resetPasswordError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={resetMedicPassword}
                  disabled={resetPasswordLoading}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {resetPasswordLoading ? 'Resetting...' : 'Reset Password'}
                </button>
                <button
                  onClick={() => {
                    setShowResetPasswordModal(false)
                    setResetPasswordMedic(null)
                    setResetPasswordForm(EMPTY_PASSWORD_RESET)
                    setResetPasswordError('')
                  }}
                  disabled={resetPasswordLoading}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
