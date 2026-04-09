'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveBusinessLogoUrl } from '@/lib/business-logo'

interface Props {
  businessId: string
  currentLogoUrl?: string | null
  currentLogoLightUrl?: string | null
  currentLogoDarkUrl?: string | null
}

type LogoVariant = 'light' | 'dark'

export default function LogoUpload({
  businessId,
  currentLogoUrl,
  currentLogoLightUrl,
  currentLogoDarkUrl,
}: Props) {
  const [logoUrl] = useState(currentLogoUrl)
  const [logoLightUrl, setLogoLightUrl] = useState(currentLogoLightUrl)
  const [logoDarkUrl, setLogoDarkUrl] = useState(currentLogoDarkUrl)
  const [uploadingVariant, setUploadingVariant] = useState<LogoVariant | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lightInputRef = useRef<HTMLInputElement>(null)
  const darkInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFileChange(variant: LogoVariant, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setError('File too large. Maximum 2 MB.')
      return
    }

    setUploadingVariant(variant)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('logo', file)
      formData.append('variant', variant)

      const res = await fetch(`/api/businesses/${businessId}/logo`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Upload failed')
      } else {
        const cacheBustedUrl = `${data.url}?t=${Date.now()}`
        if (variant === 'light') setLogoLightUrl(cacheBustedUrl)
        if (variant === 'dark') setLogoDarkUrl(cacheBustedUrl)
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setUploadingVariant(null)
      if (variant === 'light' && lightInputRef.current) lightInputRef.current.value = ''
      if (variant === 'dark' && darkInputRef.current) darkInputRef.current.value = ''
    }
  }

  const previewSets = [
    {
      variant: 'light' as const,
      title: 'Light Theme Logo',
      description: 'Shown in light mode on web and iOS.',
      previewBg: 'bg-white',
      previewText: 'text-slate-700',
      previewUrl: logoLightUrl ?? resolveBusinessLogoUrl(
        { logo_url: logoUrl, logo_url_light: logoLightUrl, logo_url_dark: logoDarkUrl },
        'light',
      ),
    },
    {
      variant: 'dark' as const,
      title: 'Dark Theme Logo',
      description: 'Shown in dark mode on web and iOS.',
      previewBg: 'bg-slate-950',
      previewText: 'text-slate-300',
      previewUrl: logoDarkUrl ?? resolveBusinessLogoUrl(
        { logo_url: logoUrl, logo_url_light: logoLightUrl, logo_url_dark: logoDarkUrl },
        'dark',
      ),
    },
  ]

  return (
    <div className="rounded-xl border border-[var(--border-md)] bg-[var(--bg-card)] p-5">
      <div className="mb-1 flex items-center gap-2">
        <svg className="h-4 w-4" style={{ color: 'var(--text-2)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Business Logos</h2>
      </div>
      <p className="mb-4 text-xs text-[var(--text-2)]">
        Upload separate logos for light and dark mode. Each device will automatically choose the correct version for its current theme. JPEG, PNG, or WebP. Max 2 MB.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {previewSets.map((item) => (
          <div key={item.variant} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <p className="text-sm font-semibold text-[var(--text-1)]">{item.title}</p>
            <p className="mt-1 text-xs text-[var(--text-2)]">{item.description}</p>

            <div className={`mt-4 flex min-h-[88px] items-center justify-center rounded-lg border border-[var(--border)] ${item.previewBg}`}>
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={`${item.title} preview`}
                  className="h-14 w-auto max-w-[160px] object-contain"
                />
              ) : (
                <span className={`text-xs ${item.previewText}`}>No {item.variant} logo uploaded</span>
              )}
            </div>

            <input
              ref={item.variant === 'light' ? lightInputRef : darkInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleFileChange(item.variant, e)}
              className="hidden"
              id={`logo-upload-${businessId}-${item.variant}`}
            />

            <label
              htmlFor={`logo-upload-${businessId}-${item.variant}`}
              className={`mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                uploadingVariant === item.variant
                  ? 'cursor-not-allowed border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-3)]'
                  : 'cursor-pointer border-[var(--border-md)] bg-[var(--bg-card)] text-[var(--text-1)] hover:border-cyan-500/40 hover:bg-[var(--bg-surface)]'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {uploadingVariant === item.variant
                ? 'Uploading…'
                : item.previewUrl
                  ? `Change ${item.variant} logo`
                  : `Upload ${item.variant} logo`}
            </label>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
    </div>
  )
}
