'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserAccount } from '@/lib/types'

interface Props {
  businessId: string
  initialAdmins: Pick<UserAccount, 'id' | 'display_name' | 'email'>[]
}

export default function AdminManager({ businessId, initialAdmins }: Props) {
  const supabase = createClient()
  const [admins, setAdmins] = useState(initialAdmins)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [createdAdminPassword, setCreatedAdminPassword] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  function beginEdit(admin: Pick<UserAccount, 'id' | 'display_name' | 'email'>) {
    setEditingId(admin.id)
    setDraftName(admin.display_name)
    setError('')
    setStatusMessage('')
  }

  function cancelEdit() {
    setEditingId(null)
    setDraftName('')
    setError('')
  }

  function generateTemporaryPassword(length = 14) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_'
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, byte => chars[byte % chars.length]).join('')
  }

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault()
    const displayName = newAdminName.trim()
    const email = newAdminEmail.trim()
    const temporaryPassword = newAdminPassword

    if (!displayName || !email || !temporaryPassword) {
      setError('Enter the admin name, email, and temporary password.')
      return
    }

    if (temporaryPassword.length < 8) {
      setError('Temporary password must be at least 8 characters.')
      return
    }

    setLoadingId('new')
    setError('')
    setStatusMessage('')

    try {
      const response = await fetch(`/api/superuser/businesses/${businessId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, email, temporary_password: temporaryPassword }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || 'Failed to create admin.')
        return
      }

      setAdmins(prev => [...prev, payload.admin])
      setNewAdminName('')
      setNewAdminEmail('')
      setNewAdminPassword('')
      setCreatedAdminPassword(payload.temporary_password || temporaryPassword)
      setShowAddForm(false)
      setStatusMessage(`Business admin created for ${email}. Share the temporary password directly with them.`)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setLoadingId(null)
    }
  }

  async function saveEdit(adminId: string) {
    const nextName = draftName.trim()
    if (!nextName) {
      setError('Display name cannot be empty.')
      return
    }

    setLoadingId(adminId)
    setError('')
    setStatusMessage('')

    const { error: rpcError } = await supabase.rpc('update_business_admin_display_name', {
      p_business_id: businessId,
      p_admin_id: adminId,
      p_display_name: nextName,
    })

    setLoadingId(null)

    if (rpcError) {
      setError(rpcError.message || 'Failed to update admin.')
      return
    }

    setAdmins(prev => prev.map(admin => admin.id === adminId ? { ...admin, display_name: nextName } : admin))
    setStatusMessage('Admin display name updated.')
    cancelEdit()
  }

  async function deleteAdmin(admin: Pick<UserAccount, 'id' | 'display_name' | 'email'>) {
    const confirmed = window.confirm(
      `Delete admin ${admin.display_name}? This removes their MedGuard admin access permanently.`
    )
    if (!confirmed) return

    setLoadingId(admin.id)
    setError('')
    setStatusMessage('')

    const { error: rpcError } = await supabase.rpc('delete_business_admin', {
      p_business_id: businessId,
      p_admin_id: admin.id,
    })

    setLoadingId(null)

    if (rpcError) {
      setError(rpcError.message || 'Failed to delete admin.')
      return
    }

    setAdmins(prev => prev.filter(item => item.id !== admin.id))
    setStatusMessage(`${admin.display_name} was deleted.`)
    if (editingId === admin.id) cancelEdit()
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-1)]">
          Admins <span className="text-sm font-normal text-[var(--text-3)]">({admins.length})</span>
        </h2>
        <button
          onClick={() => {
            setShowAddForm(prev => !prev)
            setError('')
            setStatusMessage('')
          }}
          className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
        >
          {showAddForm ? 'Cancel' : '+ Add Admin'}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {statusMessage && (
        <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          {statusMessage}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={addAdmin} className="mb-4 rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-4">
          <p className="mb-3 text-sm text-[var(--text-2)]">
            Create another business admin and set a temporary password to hand over directly.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
                Full name
              </label>
              <input
                value={newAdminName}
                onChange={e => setNewAdminName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-cyan-500"
                placeholder="Jane Smith"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
                Email
              </label>
              <input
                type="email"
                value={newAdminEmail}
                onChange={e => setNewAdminEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-cyan-500"
                placeholder="jane@example.com"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
                Temporary Password
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAdminPassword}
                  onChange={e => setNewAdminPassword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-cyan-500"
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setNewAdminPassword(generateTemporaryPassword())}
                  className="shrink-0 rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
          {createdAdminPassword && (
            <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
              Latest temporary password: <span className="font-mono font-semibold">{createdAdminPassword}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={loadingId === 'new'}
            className="mt-3 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
          >
            {loadingId === 'new' ? 'Creating...' : 'Create Admin'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)]">
        {admins.length === 0 ? (
          <p className="px-5 py-4 text-sm italic text-[var(--text-3)]">No admins.</p>
        ) : (
          admins.map((admin, index) => {
            const isEditing = editingId === admin.id
            const isLoading = loadingId === admin.id

            return (
              <div key={admin.id} className={`px-5 py-4 ${index > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
                        Display name
                      </label>
                      <input
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-cyan-500"
                        placeholder="Admin name"
                      />
                    </div>
                    <p className="text-xs text-[var(--text-3)]">
                      Email can’t be edited here yet. If the email is wrong, delete this admin and recreate the account.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(admin.id)}
                        disabled={isLoading}
                        className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
                      >
                        {isLoading ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isLoading}
                        className="rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-elevated)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[var(--text-1)]">{admin.display_name}</p>
                      <p className="text-sm text-[var(--text-2)]">{admin.email}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => beginEdit(admin)}
                        disabled={isLoading}
                        className="rounded-lg border border-[var(--border-md)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteAdmin(admin)}
                        disabled={isLoading || admins.length <= 1}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                        title={admins.length <= 1 ? 'A business must keep at least one admin.' : 'Delete admin'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
