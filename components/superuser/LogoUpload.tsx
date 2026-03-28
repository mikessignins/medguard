'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  businessId: string
  currentLogoUrl?: string | null
}

export default function LogoUpload({ businessId, currentLogoUrl }: Props) {
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setError('File too large. Maximum 2 MB.')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('logo', file)

      const res = await fetch(`/api/businesses/${businessId}/logo`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Upload failed')
      } else {
        setLogoUrl(data.logo_url + `?t=${Date.now()}`)
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h2 className="text-base font-semibold text-slate-700">Business Logo</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Displayed in the medic and admin sidebars. JPEG, PNG, or WebP. Max 2 MB.
      </p>

      <div className="flex items-center gap-4">
        {logoUrl ? (
          <div className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Business logo"
              className="h-12 w-auto max-w-[120px] rounded object-contain border border-slate-200"
            />
          </div>
        ) : (
          <div className="shrink-0 h-12 w-20 rounded border border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
            id={`logo-upload-${businessId}`}
          />
          <label
            htmlFor={`logo-upload-${businessId}`}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border cursor-pointer transition-colors ${
              uploading
                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? 'Uploading…' : logoUrl ? 'Change Logo' : 'Upload Logo'}
          </label>
          {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
        </div>
      </div>
    </div>
  )
}
