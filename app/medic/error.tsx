'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'

export default function MedicError({
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
      title="The medic workspace could not load."
      message="Your queue and review workflows are isolated here so a single failure does not crash the full portal."
      onRetry={reset}
    />
  )
}
