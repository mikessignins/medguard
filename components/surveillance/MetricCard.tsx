export default function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: number
  hint?: string
  tone?: 'default' | 'green' | 'amber' | 'red' | 'grey'
}) {
  const toneClass = {
    default: 'border-[var(--surv-border)] bg-[var(--surv-panel)] text-[var(--surv-text)]',
    green: 'border-[color:var(--surv-border)] bg-[color:var(--surv-green-soft)] text-[color:var(--surv-green-text)]',
    amber: 'border-[color:var(--surv-border)] bg-[color:var(--surv-accent-soft)] text-[color:var(--surv-accent)]',
    red: 'border-[color:var(--surv-border)] bg-[color:var(--surv-red-soft)] text-[color:var(--surv-red-text)]',
    grey: 'border-[color:var(--surv-border)] bg-[color:var(--surv-grey-soft)] text-[color:var(--surv-grey-text)]',
  }[tone]

  return (
    <div className={`rounded-[26px] border p-5 shadow-[0_16px_34px_rgba(15,23,42,0.08)] ${toneClass}`}>
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-full border-4 border-current/70 bg-white/60 text-lg font-semibold dark:bg-white/5">
          {label.slice(0, 1)}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-current/75">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-current">{value}</p>
          {hint ? <p className="mt-2 text-xs text-current/70">{hint}</p> : null}
        </div>
      </div>
    </div>
  )
}
