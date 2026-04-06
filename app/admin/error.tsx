'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'

export default function AdminError({
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
    <RouteErrorState
      title="The admin workspace could not load."
      message="The failure was contained to this route segment so the rest of the portal can keep running."
      onRetry={reset}
    />
  )
}
