'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Site } from '@/lib/types'

interface Props {
  sites: Site[]
  businessId: string
}

interface NewSiteForm {
  name: string
  latitude: string
  longitude: string
  is_office: boolean
}

const EMPTY_FORM: NewSiteForm = {
  name: '',
  latitude: '',
  longitude: '',
  is_office: false,
}

export default function SitesManager({ sites: initialSites, businessId }: Props) {
  const supabase = createClient()
  const [sites, setSites] = useState(initialSites)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewSiteForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleAddSite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const siteId = `${businessId}_${Date.now()}`

    const siteData = {
      id: siteId,
      business_id: businessId,
      name: form.name.trim(),
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      is_office: form.is_office,
    }

    const { data, error: insertError } = await supabase
      .from('sites')
      .insert(siteData)
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    if (data) setSites(prev => [...prev, data as Site])
    setForm(EMPTY_FORM)
    setShowForm(false)
    setLoading(false)
  }

  async function handleDeleteSite(siteId: string, siteName: string) {
    if (!confirm(`Delete "${siteName}"? This cannot be undone.`)) return
    setDeletingId(siteId)
    setError('')
    const { error: deleteError } = await supabase.from('sites').delete().eq('id', siteId)
    setDeletingId(null)
    if (deleteError) { setError(deleteError.message); return }
    setSites(prev => prev.filter(s => s.id !== siteId))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Sites</h1>
        <button
          onClick={() => { setShowForm(true); setError('') }}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add Site
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {sites.length === 0 && !showForm ? (
        <div className="text-center py-12 text-slate-500">
          <p>No sites yet. Add your first site above.</p>
        </div>
      ) : (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden mb-6">
          {sites.map((site, i) => (
            <div
              key={site.id}
              className={`px-5 py-4 flex items-center justify-between ${i > 0 ? 'border-t border-slate-700/50' : ''}`}
            >
              <div className="flex items-center justify-between w-full">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-100">{site.name}</p>
                    {site.is_office && (
                      <span className="text-xs bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full">Office</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {site.latitude != null && site.longitude != null
                      ? `${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)}`
                      : 'No coordinates'}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteSite(site.id, site.name)}
                  disabled={deletingId === site.id}
                  className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deletingId === site.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Site Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-5">Add New Site</h3>
            <form onSubmit={handleAddSite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Site Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500"
                  placeholder="e.g. Northern Mine Site"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500"
                    placeholder="-23.4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500"
                    placeholder="133.8888"
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_office}
                  onChange={e => setForm(f => ({ ...f, is_office: e.target.checked }))}
                  className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-sm text-slate-300">This is an office site</span>
              </label>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add Site'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError('') }}
                  disabled={loading}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium text-sm transition-colors"
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
