export type ThemeMode = 'light' | 'dark'

export interface BusinessLogoSet {
  logo_url?: string | null
  logo_url_light?: string | null
  logo_url_dark?: string | null
}

export function resolveBusinessLogoUrl(
  logos: BusinessLogoSet | null | undefined,
  theme: ThemeMode,
): string | null {
  if (!logos) return null

  const light = logos.logo_url_light ?? null
  const dark = logos.logo_url_dark ?? null
  const legacy = logos.logo_url ?? null

  if (theme === 'dark') {
    return dark ?? light ?? legacy
  }

  return light ?? dark ?? legacy
}
