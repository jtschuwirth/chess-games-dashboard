import Panel from '@/components/Section'
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
export default function ThinkPanel({
  phases,
  endedIn,
  onPickPhase,
}: {
  phases: PhaseBucket[]
  /** Label of the phase the games list is currently pinned to, if any. */
  endedIn: string | null
  onPickPhase: (label: string) => void
}) {
  const timed = phases.some(phase => phase.moves > 0)

  return (
    <Panel id="phases" title="Game phase analysis">
      <p className="text-xs text-zinc-500">
        Counted in your own moves. Click a phase to scope everything to the games that ended
        there. Pick an opening above to scope it to that line.
      </p>

      {/* flush in the panel rather than a bordered box inside a bordered box */}
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full text-sm min-w-[56rem] tabular-nums">
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
              <th className={`px-3 pt-3 pb-1 text-center font-medium ${GROUP}`} colSpan={3}>
                Clock
              </th>
              <th className={`px-3 pt-3 pb-1 text-center font-medium ${GROUP}`} colSpan={2}>
                Engine
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
              <th className="px-3 pb-2 text-right font-normal" title="Games whose slowest move landed here">
                slowest
              </th>
              <th className={`px-3 pb-2 text-right font-normal ${GROUP}`} title="Your blunders played in this phase">
                ??
              </th>
              <th className="px-5 pb-2 text-right font-normal" title="Blunders per analysed game that reached this phase">
                per game
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800 border-t border-zinc-800">
            {phases.map(phase => (
              <tr
                key={phase.label}
                className={`group ${
                  endedIn === phase.label ? 'bg-zinc-800' : 'bg-zinc-900 hover:bg-zinc-800/60'
                }`}
              >
                <td className="px-5 py-3 whitespace-nowrap">
                  <button
                    onClick={() => onPickPhase(phase.label)}
                    className={`text-left hover:underline transition-colors ${
                      endedIn === phase.label
                        ? 'text-zinc-100 underline'
                        : 'text-zinc-100 hover:text-white'
                    }`}
                    title={
                      endedIn === phase.label
                        ? 'Clear the filter'
                        : 'Filter to the games that ended in this phase'
                    }
                  >
                    {phase.name}
                  </button>
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
                  {timed ? `${phase.slowestShare}%` : '–'}
                </td>
                <td className={`px-3 py-3 text-right ${GROUP} text-red-400`}>
                  {phase.analysedReaching === 0 ? (
                    <span className="text-zinc-600">–</span>
                  ) : (
                    phase.blunders
                  )}
                </td>
                <td className="px-5 py-3 text-right text-zinc-300">
                  {phase.blundersPerGame === null ? (
                    <span className="text-zinc-600">–</span>
                  ) : (
                    phase.blundersPerGame.toFixed(2)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
