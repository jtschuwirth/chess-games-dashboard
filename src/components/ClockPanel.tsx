import { OPENING_MOVES, type ClockStats } from '@/lib/clocks'

function seconds(value: number | null): string {
  if (value === null) return '—'
  if (value < 60) return `${Math.round(value * 10) / 10}s`

  const whole = Math.round(value)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function Metric({
  value,
  label,
  tone = 'text-zinc-100',
}: {
  value: string
  label: string
  tone?: string
}) {
  return (
    <div>
      <div className={`text-xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  )
}

/**
 * The clock KPI. Timeout rates cover every game in the slice, since the termination is
 * always recorded; the timing medians only cover games that carry clock readings.
 */
export default function ClockPanel({
  stats,
  totalGames,
}: {
  stats: ClockStats
  totalGames: number
}) {
  const tone =
    stats.timeoutPctOfLosses >= 25
      ? 'text-red-400'
      : stats.timeoutPctOfLosses >= 10
        ? 'text-amber-400'
        : 'text-emerald-400'

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-zinc-300">Clock</h3>
        <span className="text-xs text-zinc-500">
          {stats.games > 0
            ? `${stats.games} of ${totalGames} games have move times`
            : 'no move times stored yet — re-sync to backfill'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Metric
          value={`${stats.timeoutPctOfLosses}%`}
          label={`of losses on time (${stats.timeouts})`}
          tone={tone}
        />
        <Metric value={`${stats.timeoutPctOfGames}%`} label="of all games on time" tone={tone} />
        <Metric value={seconds(stats.medianTimeLeft)} label="left at the end" />
        <Metric value={seconds(stats.medianPerMove)} label="per move" />
        <Metric
          value={stats.medianOpeningShare === null ? '—' : `${stats.medianOpeningShare}%`}
          label={`of time in first ${OPENING_MOVES} moves`}
        />
      </div>
    </section>
  )
}
