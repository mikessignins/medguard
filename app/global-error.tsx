'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100">
        <RouteErrorState
          title="MedGuard could not finish loading."
          message="A full-page failure was caught before it could take down the entire portal experience."
          onRetry={reset}
        />
      </body>
    </html>
  )
}
