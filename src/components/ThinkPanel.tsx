import type { PhaseBucket } from '@/lib/clocks'

const GROUP = 'border-l border-zinc-800'

/** A count, swapping to its percentage while the row is hovered. */
function Tally({ count, pct, empty }: { count: number; pct: number; empty: boolean }) {
  if (empty) return <span className="text-zinc-600">–</span>

  return (
    <>
      <span className="group-hover:hidden">{count}</span>
      <span className="hidden group-hover:inline">{pct}%</span>
    </>
  )
}

function ResultBar({ phase }: { phase: PhaseBucket }) {
  if (phase.stats.total === 0) {
    return <div className="h-1.5 w-20 rounded-full bg-zinc-800" />
  }

  return (
    <div
      className="flex h-1.5 w-20 rounded-full overflow-hidden bg-zinc-800"
      title={`${phase.stats.wins}W ${phase.stats.draws}D ${phase.stats.losses}L`}
    >
      <div className="bg-emerald-500" style={{ width: `${phase.stats.winPct}%` }} />
      <div className="bg-zinc-500" style={{ width: `${phase.stats.drawPct}%` }} />
      <div className="bg-red-500" style={{ width: `${phase.stats.lossPct}%` }} />
    </div>
  )
}

/**
 * Thinking time and results across the phases of a game, scoped by the active filters.
 *
 * Two denominators are in play, which is why the columns are grouped: reach and result
 * counts cover every game in the slice, the clock columns only cover games that carry
 * move times.
 */
export default function ThinkPanel({ phases }: { phases: PhaseBucket[] }) {
  const timed = phases.some(phase => phase.moves > 0)

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-sm">Game phase analysis</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Counted in your own moves. Pick an opening above to scope it to that line.
        </p>
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[52rem] tabular-nums">
          <thead className="bg-zinc-900 text-zinc-500">
            <tr className="text-xs uppercase tracking-wide">
              <th className="px-5 pt-3 pb-1 text-left font-medium" rowSpan={2}>
                Phase
              </th>
              <th className={`px-3 pt-3 pb-1 text-center font-medium ${GROUP}`} colSpan={2}>
                Games
              </th>
              <th className={`px-3 pt-3 pb-1 text-center font-medium ${GROUP}`} colSpan={4}>
                Ended in this phase
              </th>
              <th className={`px-3 pt-3 pb-1 text-center font-medium ${GROUP}`} colSpan={4}>
                Clock
              </th>
            </tr>
            <tr className="text-xs text-zinc-600">
              <th className={`px-3 pb-2 text-right font-normal ${GROUP}`} title="Lasted this long">
                reached
              </th>
              <th className="px-3 pb-2 text-right font-normal">ended</th>
              <th className={`px-3 pb-2 text-right font-normal ${GROUP}`}>won</th>
              <th className="px-3 pb-2 text-right font-normal">drew</th>
              <th className="px-3 pb-2 text-right font-normal">lost</th>
              <th className="px-3 pb-2" />
              <th
                className={`px-3 pb-2 text-right font-normal ${GROUP}`}
                title="Median clock left on entering, as a share of the starting time — comparable across formats"
              >
                left on entry
              </th>
              <th className="px-3 pb-2 text-right font-normal">s / move</th>
              <th className="px-3 pb-2 text-right font-normal">of clock</th>
              <th className="px-5 pb-2 text-right font-normal" title="Games whose slowest move landed here">
                slowest
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800 border-t border-zinc-800">
            {phases.map(phase => (
              <tr key={phase.label} className="bg-zinc-900 group hover:bg-zinc-800/60">
                <td className="px-5 py-3 whitespace-nowrap">
                  <div className="text-zinc-100">{phase.name}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">moves {phase.label}</div>
                </td>

                <td className={`px-3 py-3 text-right whitespace-nowrap ${GROUP}`}>
                  <span className="text-zinc-300">{phase.gamesReaching}</span>
                  <span className="text-zinc-600 text-xs"> {phase.reachShare}%</span>
                </td>
                <td className="px-3 py-3 text-right text-zinc-300">{phase.endedHere}</td>

                <td className={`px-3 py-3 text-right ${GROUP} text-emerald-400`}>
                  <Tally count={phase.stats.wins} pct={phase.stats.winPct} empty={phase.stats.total === 0} />
                </td>
                <td className="px-3 py-3 text-right text-zinc-400">
                  <Tally count={phase.stats.draws} pct={phase.stats.drawPct} empty={phase.stats.total === 0} />
                </td>
                <td className="px-3 py-3 text-right text-red-400">
                  <Tally count={phase.stats.losses} pct={phase.stats.lossPct} empty={phase.stats.total === 0} />
                </td>
                <td className="px-3 py-3">
                  <ResultBar phase={phase} />
                </td>

                <td className={`px-3 py-3 text-right ${GROUP}`}>
                  {phase.medianEnteringPct === null ? (
                    <span className="text-zinc-600">–</span>
                  ) : (
                    <span
                      className={
                        phase.medianEnteringPct < 25
                          ? 'text-red-400'
                          : phase.medianEnteringPct < 50
                            ? 'text-amber-400'
                            : 'text-zinc-300'
                      }
                    >
                      {phase.medianEnteringPct}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right text-zinc-300">
                  {phase.medianPerMove === null ? '–' : `${phase.medianPerMove}s`}
                </td>
                <td className="px-3 py-3 text-right text-zinc-300">
                  {timed ? `${phase.clockShare}%` : '–'}
                </td>
                <td className="px-5 py-3 text-right text-zinc-300">
                  {timed ? `${phase.slowestShare}%` : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
