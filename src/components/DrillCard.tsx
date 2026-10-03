'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Board from '@/components/Board'
import { Spinner } from '@/components/PageShell'
import { playMove, plyLabel, sanFromUci } from '@/lib/board'
import { ENGINE_DEPTH, classifyMove } from '@/lib/analysis'
import { analyzePosition } from '@/lib/engine'
import { formatEval, isFault } from '@/lib/review'
import { isPass, judgeAttempt, recordAttempt, type DrillCard, type DrillVerdict } from '@/lib/drill'
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

/**
 * One position put back in front of you, with the answer withheld. You have to find a
 * move that holds — one of your own alternatives, the engine's, or anything else that
 * gives nothing away — and only then does the position tell you what happened.
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
  const [best, setBest] = useState<{ san: string | null; cp: number } | null>(null)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * The engine's own answer, fetched while you think rather than after you commit.
   * Nothing is reset here: the page keys this component by position, so each one
   * arrives with fresh state already.
   */
  useEffect(() => {
    let cancelled = false

    analyzePosition(card.fen, ENGINE_DEPTH)
      .then(evaluation => {
        if (cancelled) return
        setBest({ san: sanFromUci(card.fen, evaluation.bestMoveUci), cp: evaluation.cp })
      })
      .catch(() => {
        if (!cancelled) setError('The engine could not read this position.')
      })

    return () => {
      cancelled = true
    }
  }, [card.fen])

  const played = playMove(card.fen, input)
  const illegal = input.trim().length > 0 && played === null

  async function submit() {
    if (!played || !best || answer || checking) return

    setChecking(true)
    setError(null)
    try {
      const after = await analyzePosition(played.fen, ENGINE_DEPTH)
      // scored for your opponent, who is to move after yours
      const cpAfter = -after.cp
      const tag = classifyMove(best.cp, cpAfter, false)
      const verdict = judgeAttempt(card, played.san, best.san, tag)

      setAnswer({ san: played.san, verdict, cpAfter })
      await finish(isPass(verdict))
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
        </span>
        <span className="text-zinc-600">
          {card.stat
            ? `${card.stat.correct}/${card.stat.attempts} so far`
            : 'first time you have seen this'}
        </span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-5 items-start justify-center">
        <div className="flex flex-col gap-2 w-full max-w-[22rem] mx-auto">
          <Board fen={card.fen} orientation={card.color} />
          <p className="text-xs text-zinc-500 text-center">
            You are {card.color === 'white' ? 'White' : 'Black'}, to play move {card.moveNumber}.
          </p>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {!answer ? (
            <>
              <div>
                <h3 className="font-semibold text-sm">Find a move that holds</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Not necessarily the engine&apos;s best — anything that gives nothing away
                  counts, which is what you set out to find when you reviewed this.
                </p>
              </div>

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
                <p className="text-zinc-400">
                  You played{' '}
                  <span className="font-mono text-zinc-200">
                    {plyLabel(card.ply, card.played)}
                  </span>
                  {card.playedTag && isFault(card.playedTag) && (
                    <span className="text-red-400 font-mono"> {card.playedTag}</span>
                  )}
                  .
                </p>

                {card.proposed.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-zinc-500">
                      What you found in review
                    </span>
                    {card.proposed.map(move => (
                      <p key={move.san} className="text-sm">
                        <span className="font-mono text-emerald-400">{move.san}</span>
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

                {card.cause && (
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-600">Why it went wrong:</span> {card.cause}
                  </p>
                )}
                {card.signal && (
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-600">What was there to see:</span> {card.signal}
                  </p>
                )}

                {card.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {card.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs rounded-full border border-zinc-700 text-zinc-400"
                      >
                        {tag}
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
