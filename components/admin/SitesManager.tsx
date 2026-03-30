'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Site } from '@/lib/types'

interface Props {
  sites: Site[]
  businessId: string
}

interface SiteForm {
  name: string
  latitude: string
  longitude: string
  is_office: boolean
  medic_phone: string
  eso_name: string
  safety_manager_name: string
  village_admin_name: string
}

const EMPTY_FORM: SiteForm = {
  name: '',
  latitude: '',
  longitude: '',
  is_office: false,
  medic_phone: '',
  eso_name: '',
  safety_manager_name: '',
  village_admin_name: '',
}

function siteToForm(site: Site): SiteForm {
  return {
    name: site.name,
    latitude: site.latitude != null ? String(site.latitude) : '',
    longitude: site.longitude != null ? String(site.longitude) : '',
    is_office: site.is_office,
    medic_phone: site.medic_phone ?? '',
    eso_name: site.eso_name ?? '',
    safety_manager_name: site.safety_manager_name ?? '',
    village_admin_name: site.village_admin_name ?? '',
  }
}

function nullIfEmpty(s: string): string | null {
  return s.trim() === '' ? null : s.trim()
}

export default function SitesManager({ sites: initialSites, businessId }: Props) {
  const supabase = createClient()
  const [sites, setSites] = useState(initialSites)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [form, setForm] = useState<SiteForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  function openAdd() {
    setForm(EMPTY_FORM)
    setError('')
    setShowAddForm(true)
  }

  function openEdit(site: Site) {
    setForm(siteToForm(site))
    setError('')
    setEditingSite(site)
  }

  function closeModal() {
    setShowAddForm(false)
    setEditingSite(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function handleAddSite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const siteId = `${businessId}_${Date.now()}`
    const { data, error: insertError } = await supabase
      .from('sites')
      .insert({
        id: siteId,
        business_id: businessId,
        name: form.name.trim(),
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        is_office: form.is_office,
        medic_phone: nullIfEmpty(form.medic_phone),
        eso_name: nullIfEmpty(form.eso_name),
        safety_manager_name: nullIfEmpty(form.safety_manager_name),
        village_admin_name: nullIfEmpty(form.village_admin_name),
      })
      .select()
      .single()

    setLoading(false)
    if (insertError) { setError(insertError.message); return }
    if (data) setSites(prev => [...prev, data as Site])
    closeModal()
  }

  async function handleEditSite(e: React.FormEvent) {
    e.preventDefault()
    if (!editingSite) return
    setLoading(true)
    setError('')

    const { data, error: updateError } = await supabase
      .from('sites')
      .update({
        name: form.name.trim(),
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        is_office: form.is_office,
        medic_phone: nullIfEmpty(form.medic_phone),
        eso_name: nullIfEmpty(form.eso_name),
        safety_manager_name: nullIfEmpty(form.safety_manager_name),
        village_admin_name: nullIfEmpty(form.village_admin_name),
      })
      .eq('id', editingSite.id)
      .select()
      .single()

    setLoading(false)
    if (updateError) { setError(updateError.message); return }
    if (data) setSites(prev => prev.map(s => s.id === editingSite.id ? data as Site : s))
    closeModal()
  }

  async function handleDeleteSite(siteId: string, siteName: string) {
    if (!confirm(`Delete "${siteName}"? This cannot be undone.`)) return
    setDeletingId(siteId)
    const { error: deleteError } = await supabase.from('sites').delete().eq('id', siteId)
    setDeletingId(null)
    if (deleteError) { setError(deleteError.message); return }
    setSites(prev => prev.filter(s => s.id !== siteId))
  }

  const isModalOpen = showAddForm || editingSite !== null
  const isEditing = editingSite !== null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Sites</h1>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add Site
        </button>
      </div>

      {error && !isModalOpen && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {sites.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p>No sites yet. Add your first site above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
          {sites.map((site, i) => (
            <div
              key={site.id}
              className={`px-5 py-4 ${i > 0 ? 'border-t border-slate-100' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800">{site.name}</p>
                    {site.is_office && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Office</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {site.latitude != null && site.longitude != null
                      ? `${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)}`
                      : 'No coordinates'}
                  </p>
                  {(site.medic_phone || site.eso_name || site.safety_manager_name || site.village_admin_name) && (
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
                      {site.medic_phone && (
                        <p className="text-xs text-slate-500"><span className="font-medium">Medic:</span> {site.medic_phone}</p>
                      )}
                      {site.eso_name && (
                        <p className="text-xs text-slate-500"><span className="font-medium">ESO:</span> {site.eso_name}</p>
                      )}
                      {site.safety_manager_name && (
                        <p className="text-xs text-slate-500"><span className="font-medium">Safety Mgr:</span> {site.safety_manager_name}</p>
                      )}
                      {site.village_admin_name && (
                        <p className="text-xs text-slate-500"><span className="font-medium">Village Admin:</span> {site.village_admin_name}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(site)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteSite(site.id, site.name)}
                    disabled={deletingId === site.id}
                    className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deletingId === site.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-800 mb-5">
              {isEditing ? `Edit "${editingSite!.name}"` : 'Add New Site'}
            </h3>
            <form onSubmit={isEditing ? handleEditSite : handleAddSite} className="space-y-5">

              {/* Site Details */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Site Details</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Site Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="e.g. Northern Mine Site"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="-23.4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="133.8888"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_office}
                    onChange={e => setForm(f => ({ ...f, is_office: e.target.checked }))}
                    className="rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                  />
                  <span className="text-sm text-slate-700">This is an office site</span>
                </label>
              </div>

              {/* Site Contacts */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Site Contacts <span className="font-normal normal-case">(optional)</span></p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Medic Phone Number</label>
                  <input
                    type="tel"
                    value={form.medic_phone}
                    onChange={e => setForm(f => ({ ...f, medic_phone: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="e.g. 0400 123 456"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Services Officer (ESO)</label>
                  <input
                    type="text"
                    value={form.eso_name}
                    onChange={e => setForm(f => ({ ...f, eso_name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Site Safety Manager</label>
                  <input
                    type="text"
                    value={form.safety_manager_name}
                    onChange={e => setForm(f => ({ ...f, safety_manager_name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Village Admin</label>
                  <input
                    type="text"
                    value={form.village_admin_name}
                    onChange={e => setForm(f => ({ ...f, village_admin_name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Full name"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {loading ? (isEditing ? 'Saving...' : 'Adding...') : (isEditing ? 'Save Changes' : 'Add Site')}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={loading}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
