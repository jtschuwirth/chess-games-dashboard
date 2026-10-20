'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Board from '@/components/Board'
import { tagName } from '@/lib/tags'
import { Spinner } from '@/components/PageShell'
import { formatLine, playMove, plyLabel, sanFromUci } from '@/lib/board'
import { ENGINE_DEPTH, classifyMove } from '@/lib/analysis'
import { analyzePosition } from '@/lib/engine'
import { formatEval, isFault, markColor } from '@/lib/review'
import {
  isPass,
  judgeAttempt,
  judgeFollowUp,
  lineFor,
  recordAttempt,
  stepsAlong,
  type DrillCard,
  type DrillStep,
  type DrillVerdict,
} from '@/lib/drill'
import { saveDrillResult } from '@/lib/firestore'
import type { DrillStat } from '@/types/chess'

const VERDICT_TEXT: Record<DrillVerdict, { label: string; className: string }> = {
  yours: {
    label: 'That is the move you found in review.',
    className: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  },
  engine: {
    label: "That is the engine's first choice.",
    className: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  },
  holds: {
    label: 'Not one you wrote down, but it holds.',
    className: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
  },
  miss: {
    label: 'That gives something away.',
    className: 'text-red-400 border-red-500/40 bg-red-500/10',
  },
}

interface Answer {
  san: string
  verdict: DrillVerdict
  cpAfter: number
}

/** The first step of any card: the position the game was actually in. */
function openingStep(card: DrillCard): DrillStep {
  return { fen: card.fen, reply: null, expected: '', ply: card.ply, highlight: [] }
}

/**
 * One position put back in front of you, with the answer withheld. You have to find a
 * move that holds — one of your own alternatives, the engine's, or anything else that
 * gives nothing away — and only then does the position tell you what happened.
 *
 * **When the answer is one of your own lines and that line runs on, so does the drill.**
 * A line of four plies is a plan you were counting on, and producing its first move is
 * not the same as having it: the reply you wrote for them is played and you are asked
 * what you do about it. The sequence ends when the line does, when you leave it with
 * something else that holds, or when something gives way — and only then is the attempt
 * recorded, correct only if every step of it held. That is stricter than it was, which is
 * the point: a position where you find the move and then lose the thread is not one you
 * have learned.
 *
 * Each step is judged by the rule that judged the first, against the engine read on that
 * step's own position. One search per step, fetched while you think.
 */
export default function DrillCardView({
  userId,
  card,
  position,
  total,
  onAnswered,
  onNext,
}: {
  userId: string
  card: DrillCard
  position: number
  total: number
  onAnswered: (stat: DrillStat, correct: boolean) => void
  onNext: () => void
}) {
  const [input, setInput] = useState('')
  /*
    Keyed by the position it was read for, and the reading in force is derived from that
    rather than cleared when the step moves. Clearing it in the effect is a synchronous
    setState during an effect — the rule a plan week's fold already follows — and it would
    also flash the previous step's number onto the new position for a frame.
  */
  const [reading, setReading] = useState<{ fen: string; san: string | null; cp: number } | null>(
    null,
  )
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * The walk down your own line. It is one step until an answer puts you on a line that
   * runs further, at which point the rest of it is known and the card keeps going.
   */
  const [steps, setSteps] = useState<DrillStep[]>(() => [openingStep(card)])
  const [stepIndex, setStepIndex] = useState(0)
  /** What you have played so far this card, for the board's own record of it. */
  const [sequence, setSequence] = useState<Answer[]>([])

  const step = steps[stepIndex]
  const fen = step.fen

  /**
   * The engine's own answer, fetched while you think rather than after you commit.
   * Nothing is reset here: the page keys this component by position, so each one
   * arrives with fresh state already.
   */
  useEffect(() => {
    let cancelled = false

    analyzePosition(fen, ENGINE_DEPTH)
      .then(evaluation => {
        if (cancelled) return
        setReading({ fen, san: sanFromUci(fen, evaluation.bestMoveUci), cp: evaluation.cp })
      })
      .catch(() => {
        if (!cancelled) setError('The engine could not read this position.')
      })

    return () => {
      cancelled = true
    }
  }, [fen])

  /** Only ever the reading for the position on the board right now. */
  const best = reading && reading.fen === fen ? reading : null

  const played = playMove(fen, input)
  const illegal = input.trim().length > 0 && played === null
  /** The move on the board while you are still deciding whether to commit to it. */
  const proposed = answer ? null : played

  async function submit() {
    if (!played || !best || answer || checking) return

    setChecking(true)
    setError(null)
    try {
      const after = await analyzePosition(played.fen, ENGINE_DEPTH)
      // scored for your opponent, who is to move after yours
      const cpAfter = -after.cp
      const tag = classifyMove(best.cp, cpAfter, false)
      const verdict =
        stepIndex === 0
          ? judgeAttempt(card, played.san, best.san, tag)
          : judgeFollowUp(step.expected, played.san, best.san, tag)

      const result: Answer = { san: played.san, verdict, cpAfter }
      const attempts = [...sequence, result]
      setSequence(attempts)

      /*
       * The first answer is what picks the line, since the line is chosen by what you
       * played rather than given to you — and a card showing its line in advance would
       * be a card showing its answer.
       */
      const walk =
        stepIndex === 0 && verdict === 'yours'
          ? stepsAlong(card.fen, card.ply, lineFor(card, played.san) ?? [])
          : steps

      // leaving the line ends it: there is no continuation of yours left to ask for
      const more = verdict === 'yours' && stepIndex + 1 < walk.length

      if (more) {
        setSteps(walk)
        setStepIndex(stepIndex + 1)
        setInput('')
      } else {
        setAnswer(result)
        // correct only if every step of the line held, which is what makes the
        // follow-up a check rather than a postscript
        await finish(attempts.every(entry => isPass(entry.verdict)))
      }
    } catch {
      setError('The engine could not judge that move.')
    } finally {
      setChecking(false)
    }
  }

  /** Recorded as an attempt, because not finding it is the thing worth tracking. */
  async function giveUp() {
    if (answer || checking) return
    setAnswer({ san: '', verdict: 'miss', cpAfter: 0 })
    await finish(false)
  }

  /** The line as it stands on the board, yours and theirs alternating. */
  const sofar = steps
    .slice(0, stepIndex)
    .flatMap((entry, index) => [sequence[index]?.san ?? entry.expected, steps[index + 1].reply ?? ''])
    .filter(Boolean)

  async function finish(correct: boolean) {
    const stat = recordAttempt(card.stat, correct, Date.now())
    onAnswered(stat, correct)
    try {
      await saveDrillResult(userId, card.gameId, card.ply, stat)
    } catch {
      // the attempt still counts on screen; it just will not survive a reload
      setError('Could not save that attempt.')
    }
  }

  const verdict = answer ? VERDICT_TEXT[answer.verdict] : null

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-zinc-500">
          Position {position} of {total}
          {steps.length > 1 && (
            <span className="text-zinc-600">
              {' '}
              · your line, move {stepIndex + 1} of {steps.length}
            </span>
          )}
        </span>
        <span className="text-zinc-600">
          {card.stat
            ? `${card.stat.correct}/${card.stat.attempts} so far`
            : 'first time you have seen this'}
        </span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-5 items-start justify-center">
        <div className="flex flex-col gap-2 w-full max-w-[22rem] mx-auto">
          {/*
            Play it on the board, which is where you are looking anyway — the drill is
            the one screen whose whole point is reading a position, and asking for the
            answer in a text field asks you to look away from it to give it.

            It fills the move rather than committing it. An attempt is recorded either
            way it goes, so a slipped piece must not be able to count as a miss; the
            board shows the move it would make and you still press Answer.
          */}
          <Board
            fen={proposed ? proposed.fen : fen}
            orientation={card.color}
            highlight={proposed ? [proposed.from, proposed.to] : step.highlight}
            onPlay={
              answer || proposed
                ? undefined
                : move => {
                    const san = sanFromUci(
                      fen,
                      `${move.from}${move.to}${move.promotion ?? ''}`,
                    )
                    if (san) setInput(san)
                  }
            }
          />
          <p className="text-xs text-zinc-500 text-center">
            {proposed && !answer ? (
              <>
                <span className="font-mono text-zinc-300">{proposed.san}</span> — press Answer, or{' '}
                <button
                  type="button"
                  onClick={() => setInput('')}
                  className="underline decoration-zinc-700 hover:text-zinc-200 transition-colors"
                >
                  take it back
                </button>
              </>
            ) : step.reply ? (
              <>
                They answered{' '}
                <span className="font-mono text-zinc-300">
                  {plyLabel(step.ply - 1, step.reply)}
                </span>{' '}
                — the move you wrote for them.
              </>
            ) : (
              <>
                You are {card.color === 'white' ? 'White' : 'Black'}, to play move{' '}
                {card.moveNumber}.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {!answer ? (
            <>
              <div>
                <h3 className="font-semibold text-sm">
                  {stepIndex === 0 ? 'Propose a continuation' : 'And then?'}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {stepIndex === 0
                    ? 'Play it on the board or type it. It does not have to be the engine’s best.'
                    : 'Your line runs on from here. Keep it going.'}
                </p>
              </div>

              {sofar.length > 0 && (
                <p className="text-sm">
                  <span className="text-xs uppercase tracking-wide text-zinc-500">So far</span>{' '}
                  <span className="font-mono text-zinc-300">{formatLine(card.ply, sofar)}</span>
                </p>
              )}

              <div className="flex gap-2">
                <input
                  value={input}
                  autoFocus
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') submit()
                  }}
                  placeholder="Nd5"
                  aria-label="Your move"
                  className={`flex-1 min-w-0 bg-zinc-950 border rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600 ${
                    illegal ? 'border-red-500/60' : 'border-zinc-800'
                  }`}
                />
                <button
                  onClick={submit}
                  disabled={!played || !best || checking}
                  className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {checking ? 'Checking…' : 'Answer'}
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {illegal && <span className="text-red-400">not legal here</span>}
                {!best && !error && (
                  <span className="flex items-center gap-2 text-zinc-600">
                    <Spinner size="w-3 h-3" /> reading the position
                  </span>
                )}
                <button
                  onClick={giveUp}
                  disabled={checking}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors ml-auto disabled:opacity-40"
                >
                  I can&apos;t find it
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={`border rounded-lg px-3 py-2 text-sm ${verdict?.className}`}>
                {answer.san ? (
                  <>
                    <span className="font-mono">{answer.san}</span> — {verdict?.label}{' '}
                    <span className="font-mono text-xs opacity-80">
                      {formatEval(best?.cp ?? null, card.color)} →{' '}
                      {formatEval(answer.cpAfter, card.color)}
                    </span>
                  </>
                ) : (
                  'Nothing attempted — here is what was there.'
                )}
              </div>

              <div className="flex flex-col gap-2 text-sm">
                {sequence.length > 1 && (
                  <p className="text-sm">
                    <span className="text-xs uppercase tracking-wide text-zinc-500">
                      You gave
                    </span>{' '}
                    <span className="font-mono text-zinc-300">
                      {formatLine(card.ply, [...sofar, answer.san].filter(Boolean))}
                    </span>
                  </p>
                )}

                <p className="text-zinc-400">
                  You played{' '}
                  <span className="font-mono text-zinc-200">
                    {plyLabel(card.ply, card.played)}
                  </span>
                  {card.playedTag && isFault(card.playedTag) && (
                    <span className={`${markColor(card.playedTag)} font-mono`}>
                      {' '}
                      {card.playedTag}
                    </span>
                  )}
                  .
                </p>

                {card.proposed.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-zinc-500">
                      What you found in review
                    </span>
                    {card.proposed.map((move, index) => (
                      <p key={index} className="text-sm">
                        <span className="font-mono text-emerald-400">
                          {formatLine(card.ply, move.line)}
                        </span>
                        {move.why && <span className="text-zinc-400"> — {move.why}</span>}
                      </p>
                    ))}
                  </div>
                ) : (
                  best?.san && (
                    <p className="text-sm">
                      <span className="text-xs uppercase tracking-wide text-zinc-500">
                        Engine
                      </span>{' '}
                      <span className="font-mono text-emerald-400">{best.san}</span>
                    </p>
                  )
                )}

                {card.intent && (
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-600">What I was going for:</span> {card.intent}
                  </p>
                )}
                {card.cause && (
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-600">Why it is a mistake:</span> {card.cause}
                  </p>
                )}
                {card.signal && (
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-600">What I could have seen:</span> {card.signal}
                  </p>
                )}

                {card.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {card.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs rounded-full border border-zinc-700 text-zinc-400"
                      >
                        {tagName(tag)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={onNext}
                  autoFocus
                  className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors"
                >
                  Next position
                </button>
                <Link
                  href={`/games/${card.gameId}`}
                  className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  Open the game
                </Link>
                <span className="text-xs text-zinc-600">
                  vs {card.opponent} · {new Date(card.playedAt).toLocaleDateString()}
                </span>
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </section>
  )
}
