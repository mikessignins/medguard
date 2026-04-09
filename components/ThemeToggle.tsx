'use client'
import { useEffect, useState } from 'react'

interface Props {
  compact?: boolean
}

export default function ThemeToggle({ compact = false }: Props) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
      if (saved === 'light') {
        setTheme('light')
        document.documentElement.dataset.theme = 'light'
      }
    } catch {}

    function onThemeChange(e: Event) {
      setTheme((e as CustomEvent<{ theme: 'dark' | 'light' }>).detail.theme)
    }
    window.addEventListener('medpass:themechange', onThemeChange)
    return () => window.removeEventListener('medpass:themechange', onThemeChange)
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    try {
      if (next === 'light') {
        document.documentElement.dataset.theme = 'light'
        localStorage.setItem('theme', 'light')
      } else {
        delete document.documentElement.dataset.theme
        localStorage.setItem('theme', 'dark')
      }
    } catch {}
    // Broadcast to all other ThemeToggle instances on the page
    window.dispatchEvent(new CustomEvent('medpass:themechange', { detail: { theme: next } }))
  }

  if (compact) {
    return (
      <button
        onClick={toggle}
        className="dashboard-nav-link p-2 shrink-0"
        aria-label="Toggle colour theme"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="dashboard-nav-link w-full"
      aria-label="Toggle colour theme"
    >
      {theme === 'dark' ? (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
