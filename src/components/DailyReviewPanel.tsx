'use client'

import { useState } from 'react'
import Link from 'next/link'
import { METHOD_PASSES, FAILURE_IDS, FAILURE_LABEL } from '@/lib/daily'
import { calibration, failureTally, reviewRows } from '@/lib/daily-review'
import { STANDING_LABEL } from '@/lib/bands'
import { formatEval, markColor } from '@/lib/review'
import { STANDING_INK } from '@/lib/verdict'
import { withFrom } from '@/lib/nav'
import type { Calibration } from '@/lib/daily-review'
import type { DailyGame, GameRecord, MoveFailureId, MoveLog } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/** A centipawn gap written as pawns, which is how every other figure here reads. */
function pawns(cp: number): string {
  return `${(cp / 100).toFixed(2)}`
}

function CalibrationRow({ name, figures }: { name: string; figures: Calibration }) {
  if (figures.guessed === 0) {
    return (
      <div className="flex items-baseline gap-2 text-xs">
        <span className="text-zinc-400 w-20 shrink-0">{name}</span>
        <span className="text-zinc-600">nothing written</span>
      </div>
    )
  }

  return (
    <div className="flex items-baseline gap-2 text-xs flex-wrap">
      <span className="text-zinc-400 w-20 shrink-0">{name}</span>
      <span className="text-zinc-100 font-mono">
        {figures.meanError === null ? '—' : `${pawns(figures.meanError)}`}
      </span>
      <span className="text-zinc-600">out, on average</span>
      <span className="text-zinc-700">·</span>
      <span className="text-zinc-100">
        {figures.rightBand} of {figures.guessed}
      </span>
      <span className="text-zinc-600">in the engine&rsquo;s own band</span>
    </div>
  )
}

/**
 * A finished daily game read against the engine.
 *
 * The panel is three things in the order they are asked. **Did I know where I stood** —
 * your estimates against the engine's, split by the gate, because a move where you
 * calculated a tactic and a move you judged quiet are two different skills. **Which
 * steps are failing** — the tally, which is the thing the whole exercise is for.
 * And then **the moves themselves**, only the ones with something to explain: a move
 * the engine marked, or one where your read of the position was a whole band out.
 *
 * It runs no engine of its own. The game is brought in as an ordinary game document and
 * analysed by the first pass the way any game is, one game at a time and on your press —
 * which is why the empty states here are links to that button rather than a second one.
 */
export default function DailyReviewPanel({
  game,
  record,
  onFile,
  onBringIn,
  bringing,
  error,
}: {
  game: DailyGame
  /** The game document this became, once it has been brought in. */
  record: GameRecord | null
  onFile: (ply: number, update: (current: MoveLog) => MoveLog) => void
  onBringIn: () => void
  bringing: boolean
  error?: string | null
}) {
  const [openPly, setOpenPly] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (!game.finished || !game.result) {
    return (
      <p className="text-sm text-zinc-600">
        Once the game is over, mark it finished with its result and it can be read against
        the engine here.
      </p>
    )
  }

  if (!record) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500 max-w-xl">
          Bring the game in as an ordinary game and the engine, the review and the
          mistakes dashboard all work on it. The post-mortem reads what the engine found
          rather than running one of its own.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onBringIn}
            disabled={bringing}
            className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white transition-colors disabled:opacity-40"
          >
            {bringing ? 'Bringing it in…' : 'Bring the game in'}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>
    )
  }

  const href = withFrom(`/games/${record.id}`, `/daily/${game.id}`)

  if (!record.analysis) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-zinc-500">
          The game is in. The engine has not been over it yet — that is one press on the
          game itself, and the readings come back here.
        </p>
        <Link href={href} className="text-xs text-zinc-300 underline hover:text-zinc-100">
          open the game and analyse it
        </Link>
      </div>
    )
  }

  const rows = reviewRows(game, record.analysis)
  const split = calibration(rows)
  const tally = failureTally(Object.values(game.logs))
  const wanted = rows.filter(row => row.wants)
  const shown = showAll ? rows : wanted

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">
          Did I know where I stood
        </h3>
        <CalibrationRow name="every move" figures={split.all} />
        <CalibrationRow name="found something" figures={split.concrete} />
        <CalibrationRow name="called it quiet" figures={split.quiet} />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">Which step failed</h3>
        {tally.rows.length === 0 ? (
          <p className="text-xs text-zinc-600">
            {wanted.length === 0
              ? 'Nothing to file: no move was marked and every read landed in the right band.'
              : `${wanted.length} move${wanted.length === 1 ? '' : 's'} to file, below.`}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {tally.rows.map(row => (
              <div key={row.id} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-right font-mono text-zinc-100">{row.count}</span>
                <span className="text-zinc-400 min-w-0">{row.label}</span>
              </div>
            ))}
            {tally.unavoidable > 0 && (
              <p className="text-[11px] text-zinc-600 pt-1">
                {tally.unavoidable} more filed as nothing the loop would have caught, which
                is deliberately not counted as a step.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">
            {showAll ? 'Every move of yours' : 'The moves with something to explain'}
          </h3>
          <span className="text-xs text-zinc-600">
            {wanted.length} of {rows.length}
          </span>
          <button
            type="button"
            onClick={() => setShowAll(current => !current)}
            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            {showAll ? 'only the ones to file' : 'show every move'}
          </button>
        </div>

        {shown.length === 0 ? (
          <p className="text-xs text-zinc-600">Nothing here, which is the good outcome.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {shown.map(row => {
              const open = openPly === row.ply
              const log = row.log

              return (
                <div
                  key={row.ply}
                  className="border border-zinc-800 rounded-lg bg-zinc-950/40"
                >
                  <button
                    type="button"
                    onClick={() => setOpenPly(current => (current === row.ply ? null : row.ply))}
                    className="w-full flex items-baseline gap-2.5 px-3 py-2 text-left flex-wrap"
                  >
                    <span className="font-mono text-xs text-zinc-300 w-16 shrink-0">
                      {row.moveNumber}. {row.san ?? '…'}
                    </span>
                    {row.mark && (
                      <span className={`text-xs font-semibold ${markColor(row.mark)}`}>
                        {row.mark}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500 font-mono">
                      {row.guess === null ? 'no eval' : formatEval(row.guess, game.color)}
                      <span className="text-zinc-700"> vs </span>
                      {row.cpBefore === null ? '—' : formatEval(row.cpBefore, game.color)}
                    </span>
                    {row.band && row.guessedBand && row.band !== row.guessedBand && (
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        read it as {STANDING_LABEL[row.guessedBand]}, it was{' '}
                        {/* ink rather than the badge: this is a clause in a sentence on
                            a row you scan, and a pill mid-sentence reads as a control */}
                        <span className={STANDING_INK[row.band]}>
                          {STANDING_LABEL[row.band]}
                        </span>
                      </span>
                    )}
                    <span className="ml-auto text-xs shrink-0">
                      {log?.failed ? (
                        <span className="text-zinc-400">{FAILURE_LABEL[log.failed]}</span>
                      ) : (
                        <span className="text-amber-400/80">not filed</span>
                      )}
                    </span>
                  </button>

                  {open && (
                    <div className="px-3 pb-3 flex flex-col gap-3 border-t border-zinc-800 pt-3">
                      {log === null ? (
                        <p className="text-xs text-zinc-600">
                          You wrote nothing for this move, which is a finding of its own.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {METHOD_PASSES.flatMap(pass => pass.steps)
                            .filter(step => (log.answers[step.id] ?? '').trim().length > 0)
                            .map(step => (
                              <div key={step.id} className="flex flex-col">
                                <span className="text-[11px] text-zinc-500">{step.label}</span>
                                <span className="text-xs text-zinc-300 whitespace-pre-wrap">
                                  {log.answers[step.id]}
                                </span>
                              </div>
                            ))}
                          {log.line.trim().length > 0 && (
                            <div className="flex flex-col">
                              <span className="text-[11px] text-zinc-500">
                                the line the eval was of
                              </span>
                              <span className="text-xs text-zinc-300 font-mono">{log.line}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={log?.failed ?? ''}
                          onChange={event =>
                            onFile(row.ply, current => {
                              const next = { ...current }
                              const value = event.target.value
                              if (value.length === 0) delete next.failed
                              else next.failed = value as MoveFailureId
                              return next
                            })
                          }
                          aria-label="Which step should have caught it"
                          className={INPUT}
                        >
                          <option value="">not filed yet</option>
                          {FAILURE_IDS.map(id => (
                            <option key={id} value={id}>
                              {FAILURE_LABEL[id]}
                            </option>
                          ))}
                        </select>

                        <input
                          value={log?.lesson ?? ''}
                          onChange={event =>
                            onFile(row.ply, current => {
                              const next = { ...current }
                              if (event.target.value.length === 0) delete next.lesson
                              else next.lesson = event.target.value
                              return next
                            })
                          }
                          placeholder="what to do differently"
                          className={`${INPUT} flex-1 min-w-[12rem]`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Link href={href} className="text-xs text-zinc-500 underline hover:text-zinc-200">
        open the game itself
      </Link>
    </div>
  )
}
