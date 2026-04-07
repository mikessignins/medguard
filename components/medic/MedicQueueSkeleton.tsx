// Skeleton shown by Next.js loading.tsx while a medic module page fetches data.
// Matches the shape of MedicDashboard: hero → stat cards → list rows.

export default function MedicQueueSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero */}
      <div className="medic-hero">
        <div className="space-y-3 max-w-sm">
          <div className="h-3 w-24 rounded-full bg-[var(--medic-border)] opacity-60" />
          <div className="h-7 w-64 rounded-lg bg-[var(--medic-border)] opacity-60" />
          <div className="h-4 w-48 rounded-lg bg-[var(--medic-border)] opacity-40" />
        </div>
        <div className="h-9 w-40 rounded-full bg-[var(--medic-border)] opacity-40 self-end" />
      </div>

      {/* Site pills */}
      <div className="flex gap-2">
        {[80, 96, 72].map((w, i) => (
          <div
            key={i}
            className="h-8 rounded-full bg-[var(--medic-card)] opacity-60"
            style={{ width: w }}
          />
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="medic-stat-card space-y-3">
            <div className="h-2.5 w-20 rounded-full bg-[var(--medic-border)] opacity-50" />
            <div className="h-8 w-10 rounded-lg bg-[var(--medic-border)] opacity-60" />
            <div className="h-3 w-28 rounded-full bg-[var(--medic-border)] opacity-40" />
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {[48, 52, 64].map((w, i) => (
          <div
            key={i}
            className="h-8 rounded-full bg-[var(--medic-card)] opacity-60"
            style={{ width: w }}
          />
        ))}
      </div>

      {/* List shell */}
      <div className="medic-list-shell">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`medic-list-row${i > 0 ? ' border-t border-[var(--medic-border)]' : ''}`}
          >
            {/* Left: name + chips */}
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-4 w-32 rounded bg-[var(--medic-border)] opacity-60" />
                <div className="h-3 w-20 rounded bg-[var(--medic-border)] opacity-40" />
              </div>
              <div className="flex gap-1.5">
                <div className="h-4 w-16 rounded-full bg-[var(--medic-border)] opacity-40" />
              </div>
              <div className="h-3 w-28 rounded bg-[var(--medic-border)] opacity-30" />
            </div>
            {/* Right: status badge */}
            <div className="h-6 w-16 rounded-full bg-[var(--medic-border)] opacity-40 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
