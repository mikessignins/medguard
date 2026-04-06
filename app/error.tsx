'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'

export default function Error({
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
      title="The portal hit an unexpected error."
      message="Your session is still intact. Retry the page, and if the issue keeps happening please contact support with the time it occurred."
      onRetry={reset}
    />
  )
}
