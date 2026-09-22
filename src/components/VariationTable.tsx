import type { StatBlock } from '@/lib/stats'

/** The "go up one level" control shown as the table's first row. */
export interface UpLink {
  label: string
  onSelect: () => void
}

export interface VariationRow {
  key: string
  name: string
  note?: string
  stats: StatBlock
  /** Median seconds per move in these games, null without clock data. */
  think?: number | null
  /** Omitted for the catch-all row, which has no variation to drill into. */
  onSelect?: () => void
}

/** A count, swapping to its percentage while the row is hovered. */
function Tally({ count, pct }: { count: number; pct: number }) {
  return (
    <>
      <span className="group-hover:hidden">{count}</span>
      <span className="hidden group-hover:inline">{pct}%</span>
    </>
  )
}

function ResultBar({ stats }: { stats: StatBlock }) {
  if (stats.total === 0) return <div className="h-1.5 rounded-full bg-zinc-800" />

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-800">
      <div className="bg-emerald-500" style={{ width: `${stats.winPct}%` }} />
      <div className="bg-zinc-500" style={{ width: `${stats.drawPct}%` }} />
      <div className="bg-red-500" style={{ width: `${stats.lossPct}%` }} />
    </div>
  )
}

export default function VariationTable({
  title,
  caption,
  rows,
  up,
}: {
  title: string
  caption?: string
  rows: VariationRow[]
  /** Climbs back out of the variation you drilled into. */
  up?: UpLink
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-sm">{title}</h2>
        {caption && <p className="text-xs text-zinc-500 mt-0.5">{caption}</p>}
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[38rem] tabular-nums">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-500 bg-zinc-900">
              <th className="text-left font-medium px-5 py-2.5">Variation</th>
              <th className="text-right font-medium px-3 py-2.5">Games</th>
              <th className="text-right font-medium px-3 py-2.5">W</th>
              <th className="text-right font-medium px-3 py-2.5">D</th>
              <th className="text-right font-medium px-3 py-2.5">L</th>
              <th className="text-right font-medium px-3 py-2.5">Score</th>
              <th className="text-right font-medium px-3 py-2.5">s/move</th>
              <th className="px-5 py-2.5 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {up && (
              <tr className="bg-zinc-900 hover:bg-zinc-800 transition-colors">
                <td colSpan={8} className="px-5 py-2.5">
                  <button
                    onClick={up.onSelect}
                    className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    <span aria-hidden="true">↑</span>
                    Back to {up.label}
                  </button>
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.key} className="bg-zinc-900 hover:bg-zinc-800 transition-colors group">
                <td className="px-5 py-3">
                  {row.onSelect ? (
                    <button
                      onClick={row.onSelect}
                      className="text-left text-zinc-100 hover:text-white hover:underline"
                    >
                      {row.name}
                    </button>
                  ) : (
                    <span className="text-zinc-400">{row.name}</span>
                  )}
                  {row.note && <div className="text-xs text-zinc-600 mt-0.5 max-w-xs truncate">{row.note}</div>}
                </td>
                <td className="px-3 py-3 text-right text-zinc-300">{row.stats.total}</td>
                <td className="px-3 py-3 text-right text-emerald-400">
                  <Tally count={row.stats.wins} pct={row.stats.winPct} />
                </td>
                <td className="px-3 py-3 text-right text-zinc-400">
                  <Tally count={row.stats.draws} pct={row.stats.drawPct} />
                </td>
                <td className="px-3 py-3 text-right text-red-400">
                  <Tally count={row.stats.losses} pct={row.stats.lossPct} />
                </td>
                <td className="px-3 py-3 text-right text-zinc-300">{row.stats.score}%</td>
                <td className="px-3 py-3 text-right text-zinc-400">
                  {row.think === null || row.think === undefined ? '—' : `${row.think}s`}
                </td>
                <td className="px-5 py-3">
                  <ResultBar stats={row.stats} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
