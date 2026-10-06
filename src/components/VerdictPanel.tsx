'use client'

import { useMemo, useRef, useState } from 'react'
import { useAnalysisQueue } from '@/components/AnalyseButton'
import Panel from '@/components/Section'
import { Spinner } from '@/components/PageShell'
import { queueBusy } from '@/lib/analysis-queue'
import { terminateEngine } from '@/lib/engine'
import { saveVerdicts } from '@/lib/firestore'
import {
  BREADTHS,
  BREADTH_LABEL,
  STANDINGS,
  STANDING_BADGE,
  STANDING_LABEL,
  VERDICT_LABEL,
  judgeGame,
  pendingPlies,
  verdictTally,
  type Standing,
} from '@/lib/verdict'
import type { GameRecord } from '@/types/chess'

/**
 * What the second pass makes of this slice.
 *
 * It reads what is stored and searches nothing, so the table is there the moment the
 * page is. What it cannot do is invent a reading for a move nobody has asked about,
 * which is why the coverage is on the heading rather than implied: a mix drawn from a
 * tenth of the marked moves is a mix of whichever tenth you happened to open.
 *
 * Filling the gap is a slice-wide run, which the first pass deliberately does not have.
 * The difference is the cost: analysing a game is eighty positions, while reading its
 * marked moves is about three, so a hundred games is minutes rather than hours. It still
 * says how many positions it is about to search, and it still stops.
 */
export default function VerdictPanel({
  userId,
  games,
  onJudged,
}: {
  userId: string
  games: GameRecord[]
  onJudged: (game: GameRecord) => void
}) {
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef({ stopped: false })
  /** The first pass and this one share one worker, so only one of them may be going. */
  const queue = useAnalysisQueue()

  const tally = useMemo(() => verdictTally(games), [games])

  /** Positions the run would search, which is the number worth showing before it starts. */
  const toRead = useMemo(
    () => tally.pending.reduce((count, game) => count + pendingPlies(game).length, 0),
    [tally.pending],
  )

  async function readAll() {
    stop.current = { stopped: false }
    setError(null)
    setRunning({ done: 0, total: toRead })

    let done = 0
    try {
      for (const game of tally.pending) {
        if (stop.current.stopped) break

        const judged = await judgeGame(game, {
          signal: stop.current,
          onProgress: () => setRunning({ done: ++done, total: toRead }),
        })

        if (Object.keys(judged).length === 0) continue
        await saveVerdicts(userId, game.id, judged)
        onJudged({ ...game, verdicts: { ...(game.verdicts ?? {}), ...judged } })
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That run failed.')
    } finally {
      // never while the queue still has a game going: that would reject its positions
      if (!queueBusy()) terminateEngine()
      setRunning(null)
    }
  }

  if (tally.marked === 0) {
    return (
      <Panel id="verdicts" title="What went wrong">
        <p className="text-sm text-zinc-500">
          Nothing marked in this slice yet. Analyse a game and the engine&apos;s findings
          turn up here.
        </p>
      </Panel>
    )
  }

  const rows = STANDINGS.filter(standing =>
    BREADTHS.some(breadth => tally.byStanding[standing][breadth] > 0),
  )
  const widest = Math.max(1, ...tally.byVerdict.map(row => row.count))

  return (
    <Panel
      id="verdicts"
      title="What went wrong"
      meta={`${tally.read} of ${tally.marked} marked moves read`}
      actions={
        running ? (
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            <Spinner size="w-3 h-3" />
            {running.done}/{running.total}
            <button
              onClick={() => {
                stop.current.stopped = true
              }}
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Stop
            </button>
          </span>
        ) : (
          toRead > 0 && (
            <button
              onClick={readAll}
              disabled={queue.active !== null}
              title={
                queue.active !== null
                  ? 'The engine is working through the analysis queue'
                  : `${toRead} positions, about ${Math.round((toRead * 6) / 60)} minutes`
              }
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:hover:text-zinc-500"
            >
              Read {toRead} more
            </button>
          )
        )
      }
    >
      {error && <p className="text-xs text-red-400">{error}</p>}

      {tally.read === 0 ? (
        <p className="text-sm text-zinc-500">
          None of them read yet.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1">
            {tally.byVerdict.map(row => (
              <div key={row.kind} className="grid grid-cols-[1fr_2.5rem] gap-2 items-center">
                <span className="min-w-0">
                  <span className="text-xs text-zinc-300">{VERDICT_LABEL[row.kind]}</span>
                  <span
                    className="block h-1.5 mt-0.5 bg-zinc-700 rounded-full"
                    style={{ width: `${(row.count / widest) * 100}%` }}
                  />
                </span>
                <span className="text-xs font-mono text-zinc-500 text-right tabular-nums">
                  {row.count}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 text-[10px] uppercase tracking-wide text-zinc-600">
              <span>Where you stood</span>
              {BREADTHS.map(breadth => (
                <span key={breadth} className="text-right">
                  {BREADTH_LABEL[breadth]}
                </span>
              ))}
            </div>

            {rows.map(standing => (
              <div
                key={standing}
                className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 items-center"
              >
                <span
                  className={`justify-self-start text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${STANDING_BADGE[standing as Standing]}`}
                >
                  {STANDING_LABEL[standing as Standing]}
                </span>
                {BREADTHS.map(breadth => (
                  <span
                    key={breadth}
                    className="text-sm font-mono text-zinc-300 text-right tabular-nums"
                  >
                    {tally.byStanding[standing][breadth]}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
