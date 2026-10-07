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
  BREADTH_HINT,
  BREADTH_LABEL,
  STANDINGS,
  STANDING_BADGE,
  STANDING_BAR,
  STANDING_LABEL,
  VERDICT_LABEL,
  judgeGame,
  pendingPlies,
  verdictTally,
  verdictTooltip,
  type Breadth,
  type Standing,
} from '@/lib/verdict'
import type { GameRecord, VerdictKind } from '@/types/chess'

/**
 * One template for the header, the rows and the totals, so the columns cannot drift.
 *
 * Sized to its contents rather than stretched: a `1fr` label column pushed the badges
 * and their figures to opposite ends of a 1024px panel with a hand's width of nothing
 * between them. Four and a half rem holds the longest badge there is.
 */
const MATRIX = 'grid grid-cols-[4.5rem_3rem_3rem_3rem_3.5rem] gap-x-2 items-center'

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

  /* Reversed: `STANDINGS` runs worst-first, and a fall is read from the top down. */
  const rows = [...STANDINGS]
    .reverse()
    .filter(standing => BREADTHS.some(breadth => tally.byStanding[standing][breadth] > 0))
  const widest = Math.max(1, ...tally.byVerdict.map(row => row.count))

  /*
    The margins of the matrix. The bottom row is the one finding people actually quote
    off this panel — how the whole slice splits between a line to find and a position
    that forgave anything — and without it that has to be done by eye down a column.
  */
  const downThe = (breadth: Breadth) =>
    STANDINGS.reduce((sum, standing) => sum + tally.byStanding[standing][breadth], 0)
  const across = (standing: Standing) =>
    BREADTHS.reduce((sum, breadth) => sum + tally.byStanding[standing][breadth], 0)
  const share = (count: number) =>
    tally.read === 0 ? 0 : Math.round((count / tally.read) * 100)

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
        <p className="text-sm text-zinc-500">None of them read yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/*
            The matrix first, because it is four rows against the list's eighteen and
            because it is the legend: the bars below are drawn in the colours of these
            badges, one segment per band a descriptor was said of.
          */}
          <div className="flex flex-col gap-1.5">
            {/*
              The heading sits above the matrix rather than in its first cell, where
              "Where you stood" wrapped to three lines at phone width and made the
              header taller than the rows under it. It also gives the panel two labelled
              blocks instead of one labelled and one not.
            */}
            <h3 className="text-[10px] uppercase tracking-wide text-zinc-600">
              Where you stood
            </h3>

            <div
              className={`${MATRIX} text-[10px] uppercase tracking-wide text-zinc-600`}
            >
              <span />
              {BREADTHS.map(breadth => (
                <span
                  key={breadth}
                  title={BREADTH_HINT[breadth]}
                  className="text-right cursor-help"
                >
                  {BREADTH_LABEL[breadth]}
                </span>
              ))}
              <span className="text-right text-zinc-500">all</span>
            </div>

            {rows.map(standing => (
              <div key={standing} className={MATRIX}>
                <span
                  title={`${across(standing)} of the ${tally.read} readings fell from a ${STANDING_LABEL[standing]} position`}
                  className={`justify-self-start text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border cursor-help ${STANDING_BADGE[standing]}`}
                >
                  {STANDING_LABEL[standing]}
                </span>
                {BREADTHS.map(breadth => (
                  <Count
                    key={breadth}
                    value={tally.byStanding[standing][breadth]}
                    title={`${STANDING_LABEL[standing]}, ${BREADTH_LABEL[breadth]}. ${BREADTH_HINT[breadth]}`}
                  />
                ))}
                <Count value={across(standing)} muted />
              </div>
            ))}

            <div className={`${MATRIX} border-t border-zinc-800 pt-1.5`}>
              <span className="text-[10px] uppercase tracking-wide text-zinc-600">all</span>
              {BREADTHS.map(breadth => (
                <span key={breadth} className="text-right">
                  <span className="block text-sm font-mono text-zinc-300 tabular-nums">
                    {downThe(breadth)}
                  </span>
                  <span className="block text-[10px] font-mono text-zinc-600 tabular-nums">
                    {share(downThe(breadth))}%
                  </span>
                </span>
              ))}
              <Count value={tally.read} muted />
            </div>
          </div>

          {/*
            And the detail under it, two columns deep so eighteen descriptors are nine
            rows rather than a column of bars twice the height of everything else in the
            panel. Each says what it is the name of on hover — see `verdictRecipe`.
          */}
          <div className="border-t border-zinc-800 pt-4">
            <h3 className="text-[10px] uppercase tracking-wide text-zinc-600 mb-2">
              What each one was
            </h3>
            <div className="columns-1 sm:columns-2 gap-x-8">
              {tally.byVerdict.map(row => (
                <Descriptor
                  key={row.kind}
                  kind={row.kind}
                  count={row.count}
                  byStanding={row.byStanding}
                  widest={widest}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

/** A figure in the matrix. Zero is dimmed rather than shouted, since most cells are low. */
function Count({
  value,
  title,
  muted = false,
}: {
  value: number
  title?: string
  /** The margins, which are a sum of the cells beside them rather than a reading. */
  muted?: boolean
}) {
  return (
    <span
      title={title}
      className={`text-sm font-mono text-right tabular-nums ${title ? 'cursor-help' : ''} ${
        value === 0 ? 'text-zinc-700' : muted ? 'text-zinc-500' : 'text-zinc-300'
      }`}
    >
      {value}
    </span>
  )
}

/**
 * One descriptor, its count, and a bar in the colours of the bands it was said of.
 *
 * Drawn from the readings rather than from the table: nearly every descriptor names
 * cells of one row and comes out a single colour, but three span two bands — `gave it
 * away` is said of a stable fall from better and of one from level — and a single
 * colour for those would be half wrong. Split, the bar answers which of them were
 * yours, which is the question having one name for two falls raises.
 *
 * The recipe is a tooltip rather than a line on the row. Nearly every descriptor would
 * read fine inline, but `walked into mate` names fifteen cells, so printing them would
 * be four lines of noise on every row to serve the one that needs it. `cursor-help` is
 * what says there is something to hover, rather than a sentence telling you to.
 */
function Descriptor({
  kind,
  count,
  byStanding,
  widest,
}: {
  kind: VerdictKind
  count: number
  byStanding: Record<Standing, number>
  /** The largest count in the slice, which is what the bars are drawn against. */
  widest: number
}) {
  const bands = [...STANDINGS].reverse().filter(standing => byStanding[standing] > 0)

  return (
    <div
      title={verdictTooltip(kind, byStanding)}
      className="break-inside-avoid pb-2.5 cursor-help"
    >
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 truncate text-xs text-zinc-300">
          {VERDICT_LABEL[kind]}
        </span>
        <span className="text-xs font-mono text-zinc-500 tabular-nums">{count}</span>
      </div>
      {/* a track behind the bar, so a short one reads as a share rather than floating */}
      <span className="flex h-2 mt-1 rounded-full bg-zinc-800/80 overflow-hidden">
        {bands.map(standing => (
          <span
            key={standing}
            className={`h-full shrink-0 ${STANDING_BAR[standing]}`}
            style={{ width: `${(byStanding[standing] / widest) * 100}%` }}
          />
        ))}
      </span>
    </div>
  )
}
