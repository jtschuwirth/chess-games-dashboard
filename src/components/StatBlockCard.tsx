import type { StatBlock } from '@/lib/stats'

const SEGMENTS = [
  { key: 'wins', label: 'Wins', bar: 'bg-emerald-500', text: 'text-emerald-400' },
  { key: 'draws', label: 'Draws', bar: 'bg-zinc-500', text: 'text-zinc-300' },
  { key: 'losses', label: 'Losses', bar: 'bg-red-500', text: 'text-red-400' },
] as const

const PCT_KEY = { wins: 'winPct', draws: 'drawPct', losses: 'lossPct' } as const

export default function StatBlockCard({ label, stats }: { label: string; stats: StatBlock }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-300">{label}</h3>
        <span className="text-xs text-zinc-500">
          {stats.total} game{stats.total === 1 ? '' : 's'}
        </span>
      </div>

      {stats.total === 0 ? (
        <p className="text-sm text-zinc-600 text-center py-6">No games in this slice</p>
      ) : (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-800">
            {SEGMENTS.map(segment => (
              <div
                key={segment.key}
                className={segment.bar}
                style={{ width: `${stats[PCT_KEY[segment.key]]}%` }}
                title={`${segment.label}: ${stats[segment.key]} (${stats[PCT_KEY[segment.key]]}%)`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {SEGMENTS.map(segment => (
              <div key={segment.key}>
                <div className={`text-xl font-bold ${segment.text}`}>{stats[segment.key]}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {segment.label} · {stats[PCT_KEY[segment.key]]}%
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-zinc-500 text-center border-t border-zinc-800 pt-3">
            Score <span className="text-zinc-300 font-medium">{stats.score}%</span>
          </div>
        </>
      )}
    </div>
  )
}
