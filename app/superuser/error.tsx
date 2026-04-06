'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'

export default function SuperuserError({
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
      title="The superuser workspace could not load."
      message="This segment now fails gracefully instead of taking down the entire portal."
      onRetry={reset}
    />
  )
}
