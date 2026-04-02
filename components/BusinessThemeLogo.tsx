'use client'

import { useEffect, useState } from 'react'
import { resolveBusinessLogoUrl, type ThemeMode } from '@/lib/business-logo'

interface Props {
  businessName: string
  logoUrl?: string | null
  logoUrlLight?: string | null
  logoUrlDark?: string | null
  className?: string
  alt?: string
}

function currentTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export default function BusinessThemeLogo({
  businessName,
  logoUrl,
  logoUrlLight,
  logoUrlDark,
  className = 'h-8 w-auto max-w-[80px] rounded object-contain',
  alt,
}: Props) {
  const [theme, setTheme] = useState<ThemeMode>('dark')

  useEffect(() => {
    setTheme(currentTheme())

    function onThemeChange(event: Event) {
      setTheme((event as CustomEvent<{ theme: ThemeMode }>).detail.theme)
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function onMediaChange() {
      try {
        const saved = localStorage.getItem('theme')
        if (saved === 'light' || saved === 'dark') return
      } catch {}
      setTheme(media.matches ? 'dark' : 'light')
    }

    window.addEventListener('medpass:themechange', onThemeChange)
    media.addEventListener?.('change', onMediaChange)
    return () => {
      window.removeEventListener('medpass:themechange', onThemeChange)
      media.removeEventListener?.('change', onMediaChange)
    }
  }, [])

  const resolvedLogo = resolveBusinessLogoUrl(
    {
      logo_url: logoUrl,
      logo_url_light: logoUrlLight,
      logo_url_dark: logoUrlDark,
    },
    theme,
  )

  if (!resolvedLogo) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedLogo}
      alt={alt ?? `${businessName} logo`}
      className={className}
    />
  )
}
