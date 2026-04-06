'use client'

type RouteErrorStateProps = {
  title: string
  message: string
  onRetry?: () => void
}

export default function RouteErrorState({ title, message, onRetry }: RouteErrorStateProps) {
  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-2xl items-center justify-center px-6 py-16">
      <div className="w-full rounded-3xl border border-rose-200/70 bg-white/95 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <div className="mb-4 inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
          Something went wrong
        </div>
        <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-6 inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
