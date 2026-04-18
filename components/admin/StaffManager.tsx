'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { UserAccount, Site } from '@/lib/types'

type StaffRole = 'medic' | 'occ_health'
type PendingStaffRole = 'pending_medic' | 'pending_occ_health'

interface Props {
  pendingMedics: UserAccount[]
  activeMedics: UserAccount[]
  inactiveMedics: UserAccount[]
  pendingOccHealth: UserAccount[]
  activeOccHealth: UserAccount[]
  inactiveOccHealth: UserAccount[]
  sites: Site[]
  businessId: string
}

interface ContractorForm {
  display_name: string
  email: string
  temporary_password: string
  contract_end_date: string
  site_ids: string[]
}

interface ContractorAccountResult {
  display_name: string
  email: string
  temporary_password: string
  contract_end_date: string | null
  site_names: string[]
}

interface PasswordResetForm {
  temporary_password: string
  confirmPassword: string
}

interface StaffSectionConfig {
  role: StaffRole
  pendingRole: PendingStaffRole
  singularLabel: string
  pluralLabel: string
  pendingLabel: string
  contractorLabel: string
  signupHref: string
}

const STAFF_CONFIG: Record<StaffRole, StaffSectionConfig> = {
  medic: {
    role: 'medic',
    pendingRole: 'pending_medic',
    singularLabel: 'Medic',
    pluralLabel: 'Medics',
    pendingLabel: 'pending medics',
    contractorLabel: 'Medic',
    signupHref: '/medic-signup',
  },
  occ_health: {
    role: 'occ_health',
    pendingRole: 'pending_occ_health',
    singularLabel: 'Occ Health',
    pluralLabel: 'Occ Health Staff',
    pendingLabel: 'pending occ health staff',
    contractorLabel: 'Occ Health',
    signupHref: '/occ-health-signup',
  },
}

const EMPTY_CONTRACTOR: ContractorForm = {
  display_name: '',
  email: '',
  temporary_password: '',
  contract_end_date: '',
  site_ids: [],
}

const EMPTY_PASSWORD_RESET: PasswordResetForm = {
  temporary_password: '',
  confirmPassword: '',
}

export default function StaffManager({
  pendingMedics: initialPendingMedics,
  activeMedics: initialActiveMedics,
  inactiveMedics: initialInactiveMedics,
  pendingOccHealth: initialPendingOccHealth,
  activeOccHealth: initialActiveOccHealth,
  inactiveOccHealth: initialInactiveOccHealth,
  sites,
  businessId,
}: Props) {
  const supabase = createClient()

  const [pendingStaff, setPendingStaff] = useState<Record<StaffRole, UserAccount[]>>({
    medic: initialPendingMedics,
    occ_health: initialPendingOccHealth,
  })
  const [activeStaff, setActiveStaff] = useState<Record<StaffRole, UserAccount[]>>({
    medic: initialActiveMedics,
    occ_health: initialActiveOccHealth,
  })
  const [inactiveStaff, setInactiveStaff] = useState<Record<StaffRole, UserAccount[]>>({
    medic: initialInactiveMedics,
    occ_health: initialInactiveOccHealth,
  })
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const [showSiteModal, setShowSiteModal] = useState(false)
  const [modalStaff, setModalStaff] = useState<UserAccount | null>(null)
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [contractEndDate, setContractEndDate] = useState('')
  const [isApproving, setIsApproving] = useState(false)
  const [modalRole, setModalRole] = useState<StaffRole>('medic')

  const [showContractorForm, setShowContractorForm] = useState(false)
  const [contractorRole, setContractorRole] = useState<StaffRole>('medic')
  const [contractorForm, setContractorForm] = useState<ContractorForm>(EMPTY_CONTRACTOR)
  const [contractorLoading, setContractorLoading] = useState(false)
  const [contractorError, setContractorError] = useState('')
  const [contractorSuccess, setContractorSuccess] = useState('')
  const [contractorResult, setContractorResult] = useState<ContractorAccountResult | null>(null)

  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
  const [resetPasswordStaff, setResetPasswordStaff] = useState<UserAccount | null>(null)
  const [resetPasswordForm, setResetPasswordForm] = useState<PasswordResetForm>(EMPTY_PASSWORD_RESET)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [resetPasswordError, setResetPasswordError] = useState('')

  function openSiteModal(staff: UserAccount, role: StaffRole, approving: boolean) {
    setModalStaff(staff)
    setModalRole(role)
    setSelectedSiteIds(staff.site_ids || [])
    setContractEndDate(staff.contract_end_date || '')
    setIsApproving(approving)
    setShowSiteModal(true)
    setError('')
    setStatusMessage('')
  }

  function openResetPasswordModal(staff: UserAccount) {
    setResetPasswordStaff(staff)
    setResetPasswordForm(EMPTY_PASSWORD_RESET)
    setResetPasswordError('')
    setShowResetPasswordModal(true)
    setStatusMessage('')
  }

  function generateTemporaryPassword(length = 14) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_'
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, byte => chars[byte % chars.length]).join('')
  }

  function getSiteNames(siteIds: string[]) {
    return siteIds.map(id => sites.find(site => site.id === id)?.name || id).filter(Boolean)
  }

  function isExpiredContractValue(contractEndDate: string | null | undefined) {
    if (!contractEndDate) return false
    const expiry = new Date(`${contractEndDate}T23:59:59`)
    return expiry.getTime() < Date.now()
  }

  function toggleSite(siteId: string) {
    setSelectedSiteIds(prev =>
      prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId]
    )
  }

  function toggleContractorSite(siteId: string) {
    setContractorForm(form => ({
      ...form,
      site_ids: form.site_ids.includes(siteId)
        ? form.site_ids.filter(id => id !== siteId)
        : [...form.site_ids, siteId],
    }))
  }

  function moveStaffMember(role: StaffRole, target: 'pending' | 'active' | 'inactive', user: UserAccount) {
    setPendingStaff(prev => ({
      ...prev,
      [role]: prev[role].filter(member => member.id !== user.id),
    }))
    setActiveStaff(prev => ({
      ...prev,
      [role]: prev[role].filter(member => member.id !== user.id),
    }))
    setInactiveStaff(prev => ({
      ...prev,
      [role]: prev[role].filter(member => member.id !== user.id),
    }))

    if (target === 'pending') {
      setPendingStaff(prev => ({ ...prev, [role]: [...prev[role], user] }))
      return
    }

    if (target === 'active') {
      setActiveStaff(prev => ({ ...prev, [role]: [...prev[role], user] }))
      return
    }

    setInactiveStaff(prev => ({ ...prev, [role]: [...prev[role], user] }))
  }

  async function saveModal() {
    if (!modalStaff) return
    setLoading(modalStaff.id)
    setError('')
    setStatusMessage('')

    const expiredContract = isExpiredContractValue(contractEndDate || null)
    const nextInactive = expiredContract ? true : modalStaff.is_inactive ?? false
    const approvedRole = modalRole
    const updates: Record<string, unknown> = {
      site_ids: selectedSiteIds,
      contract_end_date: contractEndDate || null,
      is_inactive: nextInactive,
    }

    if (isApproving) updates.role = approvedRole

    const { error: updateError } = await supabase
      .from('user_accounts')
      .update(updates)
      .eq('id', modalStaff.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(null)
      return
    }

    fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: isApproving
          ? `${approvedRole}_approved`
          : `${approvedRole}_site_assignment_changed`,
        target_user_id: modalStaff.id,
        target_name: modalStaff.display_name,
        detail: {
          role: approvedRole,
          site_ids: selectedSiteIds,
          site_names: getSiteNames(selectedSiteIds),
          contract_end_date: contractEndDate || null,
        },
      }),
    }).catch(() => {})

    const updated = { ...modalStaff, ...updates, role: isApproving ? approvedRole : modalStaff.role } as UserAccount
    moveStaffMember(modalRole, nextInactive ? 'inactive' : 'active', updated)

    setStatusMessage(
      expiredContract
        ? `${modalStaff.display_name} has an expired contract and was moved to the inactive list.`
        : `${modalStaff.display_name} was updated.`,
    )

    setLoading(null)
    setShowSiteModal(false)
    setModalStaff(null)
  }

  async function deactivateStaff(staff: UserAccount, role: StaffRole) {
    if (!confirm(`Move ${staff.display_name} to the inactive list? They can be reactivated later.`)) return
    setLoading(staff.id)
    setError('')

    const { error: updateError } = await supabase
      .from('user_accounts')
      .update({ is_inactive: true })
      .eq('id', staff.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(null)
      return
    }

    fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: `${role}_deactivated`,
        target_user_id: staff.id,
        target_name: staff.display_name,
      }),
    }).catch(() => {})

    moveStaffMember(role, 'inactive', { ...staff, is_inactive: true })
    setStatusMessage(`${staff.display_name} was moved to the inactive list.`)
    setLoading(null)
  }

  async function reactivateStaff(staff: UserAccount, role: StaffRole) {
    if (isExpiredContractValue(staff.contract_end_date)) {
      setError(`Update ${staff.display_name}'s contract end date before reactivating them.`)
      return
    }
    if (!confirm(`Reactivate ${staff.display_name}? They will return to the active staff list.`)) return
    setLoading(staff.id)
    setError('')
    setStatusMessage('')

    const { error: updateError } = await supabase
      .from('user_accounts')
      .update({ is_inactive: false })
      .eq('id', staff.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(null)
      return
    }

    fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: `${role}_reactivated`,
        target_user_id: staff.id,
        target_name: staff.display_name,
      }),
    }).catch(() => {})

    moveStaffMember(role, 'active', { ...staff, is_inactive: false })
    setStatusMessage(`${staff.display_name} was reactivated.`)
    setLoading(null)
  }

  async function resetStaffPassword() {
    if (!resetPasswordStaff) return
    setResetPasswordError('')
    setError('')
    setStatusMessage('')

    if (resetPasswordForm.temporary_password !== resetPasswordForm.confirmPassword) {
      setResetPasswordError('Passwords do not match.')
      return
    }

    if (resetPasswordForm.temporary_password.length < 8) {
      setResetPasswordError('Temporary password must be at least 8 characters.')
      return
    }

    setResetPasswordLoading(true)

    try {
      const response = await fetch(`/api/admin/medics/${resetPasswordStaff.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporary_password: resetPasswordForm.temporary_password }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setResetPasswordError(payload.error || 'Failed to reset staff password.')
        return
      }

      fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: `${resetPasswordStaff.role}_password_reset`,
          target_user_id: resetPasswordStaff.id,
          target_name: resetPasswordStaff.display_name,
        }),
      }).catch(() => {})

      setShowResetPasswordModal(false)
      setStatusMessage(`Temporary password updated for ${resetPasswordStaff.display_name}. Share it directly with them.`)
      setResetPasswordStaff(null)
      setResetPasswordForm(EMPTY_PASSWORD_RESET)
    } catch {
      setResetPasswordError('Could not reach the server. Please try again.')
    } finally {
      setResetPasswordLoading(false)
    }
  }

  async function addContractorStaff(e: React.FormEvent) {
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
          temporary_password: contractorForm.temporary_password,
          site_ids: contractorForm.site_ids,
          contract_end_date: contractorForm.contract_end_date || null,
          role: contractorRole,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setContractorError(payload.error || 'Failed to create staff account.')
        return
      }

      moveStaffMember(contractorRole, 'active', {
        id: payload.user.id,
        business_id: businessId,
        display_name: contractorForm.display_name.trim(),
        email: contractorForm.email.trim(),
        role: contractorRole,
        site_ids: contractorForm.site_ids,
        contract_end_date: contractorForm.contract_end_date || null,
        is_inactive: false,
      } as UserAccount)
    } catch {
      setContractorError('Could not reach the server. Please try again.')
      return
    } finally {
      setContractorLoading(false)
    }

    setContractorSuccess(`${STAFF_CONFIG[contractorRole].singularLabel} account created for ${contractorForm.email}. Share the temporary password directly with them.`)
    setStatusMessage(`${STAFF_CONFIG[contractorRole].singularLabel} account created for ${contractorForm.display_name}.`)
    setContractorResult({
      display_name: contractorForm.display_name.trim(),
      email: contractorForm.email.trim(),
      temporary_password: contractorForm.temporary_password,
      contract_end_date: contractorForm.contract_end_date || null,
      site_names: getSiteNames(contractorForm.site_ids),
    })

    fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: `contractor_${contractorRole}_created`,
        target_name: contractorForm.display_name.trim(),
        detail: {
          role: contractorRole,
          email: contractorForm.email.trim(),
          site_names: getSiteNames(contractorForm.site_ids),
          contract_end_date: contractorForm.contract_end_date || null,
        },
      }),
    }).catch(() => {})

    setContractorForm(EMPTY_CONTRACTOR)
  }

  const inputCls = 'w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500'

  function renderStaffList(role: StaffRole, listType: 'pending' | 'active' | 'inactive') {
    const config = STAFF_CONFIG[role]
    const staffList = listType === 'pending' ? pendingStaff[role] : listType === 'active' ? activeStaff[role] : inactiveStaff[role]

    if (listType === 'pending') {
      return (
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-300">
            Pending {config.pluralLabel}
            {staffList.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-orange-400">({staffList.length} waiting)</span>
            ) : null}
          </h2>
          {staffList.length === 0 ? (
            <p className="text-sm italic text-slate-500">No {config.pendingLabel}.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/60">
              {staffList.map((staff, index) => (
                <div
                  key={staff.id}
                  className={`flex items-center justify-between px-5 py-4 ${index > 0 ? 'border-t border-slate-700/50' : ''}`}
                >
                  <div>
                    <p className="font-medium text-slate-100">{staff.display_name}</p>
                    <p className="text-sm text-slate-500">{staff.email}</p>
                  </div>
                  <button
                    onClick={() => openSiteModal(staff, role, true)}
                    disabled={loading === staff.id}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {loading === staff.id ? 'Processing...' : 'Approve'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    const isInactive = listType === 'inactive'

    return (
      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-300">
          {isInactive ? `Inactive ${config.pluralLabel}` : `Active ${config.pluralLabel}`}
          {staffList.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-slate-500">({staffList.length})</span>
          ) : null}
        </h2>
        {staffList.length === 0 ? (
          <p className="text-sm italic text-slate-500">No {isInactive ? `inactive ${config.pluralLabel.toLowerCase()}` : `active ${config.pluralLabel.toLowerCase()}`}.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/60">
            {staffList.map((staff, index) => {
              const siteNames = getSiteNames(staff.site_ids || [])
              const isContractor = !!staff.contract_end_date
              const hasExpiredContract = isExpiredContractValue(staff.contract_end_date)

              return (
                <div
                  key={staff.id}
                  className={`flex items-center justify-between gap-4 px-5 py-4 ${index > 0 ? 'border-t border-slate-700/50' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-100">{staff.display_name}</p>
                      {isInactive ? (
                        <span className="rounded-full border border-slate-600/60 bg-slate-700/70 px-2 py-0.5 text-xs text-slate-300">Inactive</span>
                      ) : null}
                      {isContractor ? (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">Contractor</span>
                      ) : null}
                      {hasExpiredContract ? (
                        <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">Expired Contract</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-500">{staff.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {siteNames.length > 0 ? (
                        siteNames.map(name => (
                          <span key={name} className="rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">
                            {name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs italic text-slate-600">No sites assigned</span>
                      )}
                    </div>
                    {staff.contract_end_date ? (
                      <p className="mt-1 text-xs text-amber-500">
                        Contract ends: {format(new Date(staff.contract_end_date), 'dd MMM yyyy')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => openResetPasswordModal(staff)}
                      disabled={loading === staff.id}
                      className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-600 disabled:opacity-50"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => openSiteModal(staff, role, false)}
                      disabled={loading === staff.id}
                      className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-600 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    {isInactive ? (
                      <button
                        onClick={() => reactivateStaff(staff, role)}
                        disabled={loading === staff.id}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {loading === staff.id ? '...' : 'Reactivate'}
                      </button>
                    ) : (
                      <button
                        onClick={() => deactivateStaff(staff, role)}
                        disabled={loading === staff.id}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {loading === staff.id ? '...' : 'Deactivate'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const modalConfig = STAFF_CONFIG[modalRole]
  const contractorConfig = STAFF_CONFIG[contractorRole]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Staff Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Approve and manage medic and occ health staff access for this business.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setContractorRole('medic')
              setShowContractorForm(true)
              setContractorError('')
              setContractorSuccess('')
              setContractorResult(null)
            }}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
          >
            + Add Medic
          </button>
          <button
            onClick={() => {
              setContractorRole('occ_health')
              setShowContractorForm(true)
              setContractorError('')
              setContractorSuccess('')
              setContractorResult(null)
            }}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500"
          >
            + Add Occ Health
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4 text-sm text-slate-400">
        External signup links:
        <a href={STAFF_CONFIG.medic.signupHref} className="ml-2 text-cyan-400 hover:text-cyan-300">Medic</a>
        <span className="mx-2 text-slate-600">•</span>
        <a href={STAFF_CONFIG.occ_health.signupHref} className="text-cyan-400 hover:text-cyan-300">Occ Health</a>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-8">
          {renderStaffList('medic', 'pending')}
          {renderStaffList('medic', 'active')}
          {renderStaffList('medic', 'inactive')}
        </div>
        <div className="space-y-8">
          {renderStaffList('occ_health', 'pending')}
          {renderStaffList('occ_health', 'active')}
          {renderStaffList('occ_health', 'inactive')}
        </div>
      </div>

      {showSiteModal && modalStaff ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold text-slate-100">
              {isApproving ? `Approve ${modalConfig.singularLabel}` : `Edit ${modalConfig.singularLabel}`}
            </h3>
            <p className="mt-1 text-sm text-slate-400">{modalStaff.display_name}</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Assigned sites</label>
                <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                  {sites.map(site => (
                    <label key={site.id} className="flex items-center gap-3 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.includes(site.id)}
                        onChange={() => toggleSite(site.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
                      />
                      <span>{site.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Contract end date</label>
                <input
                  type="date"
                  value={contractEndDate}
                  onChange={e => setContractEndDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSiteModal(false)
                  setModalStaff(null)
                }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={saveModal}
                disabled={loading === modalStaff.id}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
              >
                {loading === modalStaff.id ? 'Saving...' : isApproving ? 'Approve' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showContractorForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Add {contractorConfig.contractorLabel}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Create an approved staff account directly for this business.
                </p>
              </div>
              <button
                onClick={() => setShowContractorForm(false)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              {(['medic', 'occ_health'] as StaffRole[]).map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setContractorRole(role)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    contractorRole === role
                      ? 'bg-cyan-600 text-white'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {STAFF_CONFIG[role].pluralLabel}
                </button>
              ))}
            </div>

            <form onSubmit={addContractorStaff} className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Full name</label>
                  <input
                    value={contractorForm.display_name}
                    onChange={e => setContractorForm(form => ({ ...form, display_name: e.target.value }))}
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email</label>
                  <input
                    type="email"
                    value={contractorForm.email}
                    onChange={e => setContractorForm(form => ({ ...form, email: e.target.value }))}
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Temporary password</label>
                  <div className="flex gap-2">
                    <input
                      value={contractorForm.temporary_password}
                      onChange={e => setContractorForm(form => ({ ...form, temporary_password: e.target.value }))}
                      required
                      minLength={8}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => setContractorForm(form => ({ ...form, temporary_password: generateTemporaryPassword() }))}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                    >
                      Generate
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Contract end date</label>
                  <input
                    type="date"
                    value={contractorForm.contract_end_date}
                    onChange={e => setContractorForm(form => ({ ...form, contract_end_date: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Assigned sites</label>
                <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                  {sites.map(site => (
                    <label key={site.id} className="flex items-center gap-3 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={contractorForm.site_ids.includes(site.id)}
                        onChange={() => toggleContractorSite(site.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
                      />
                      <span>{site.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {contractorError ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {contractorError}
                </div>
              ) : null}

              {contractorSuccess ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                  {contractorSuccess}
                </div>
              ) : null}

              {contractorResult ? (
                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
                  <p className="font-medium text-slate-100">{contractorResult.display_name}</p>
                  <p className="mt-1">{contractorResult.email}</p>
                  <p className="mt-1 font-mono text-cyan-300">{contractorResult.temporary_password}</p>
                </div>
              ) : null}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowContractorForm(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contractorLoading}
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
                >
                  {contractorLoading ? 'Creating...' : `Create ${contractorConfig.contractorLabel}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showResetPasswordModal && resetPasswordStaff ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold text-slate-100">Reset Password</h3>
            <p className="mt-1 text-sm text-slate-400">{resetPasswordStaff.display_name}</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Temporary password</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={resetPasswordForm.temporary_password}
                    onChange={e => setResetPasswordForm(form => ({ ...form, temporary_password: e.target.value }))}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => setResetPasswordForm(form => ({ ...form, temporary_password: generateTemporaryPassword() }))}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    Generate
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Confirm password</label>
                <input
                  type="text"
                  value={resetPasswordForm.confirmPassword}
                  onChange={e => setResetPasswordForm(form => ({ ...form, confirmPassword: e.target.value }))}
                  className={inputCls}
                />
              </div>

              {resetPasswordError ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {resetPasswordError}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowResetPasswordModal(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={resetStaffPassword}
                disabled={resetPasswordLoading}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
              >
                {resetPasswordLoading ? 'Saving...' : 'Reset password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
