'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { sideToMove } from '@/lib/board'
import { getPatterns, savePatternDrill } from '@/lib/firestore'
import { emptyTree } from '@/lib/movetree'
import {
  LADDER,
  dueCards,
  drillSummary,
  judge,
  reschedule,
  type PatternAnswer,
  type PatternCard,
} from '@/lib/pattern-drill'
import type { PatternRecord } from '@/types/chess'

/**
 * The boundary drill: does the pattern still work here?
 *
 * The one question about a pattern whose answer you cannot get from having memorised its
 * diagram. Each card is a point you wrote under 3a or 3b, and the section it sits in is
 * the answer — so this is marked rather than self-graded, and it works on every write-up
 * already taken apart without a single new field being filled in.
 *
 * A point carrying a position is shown as a **board** and you have to find the change
 * yourself; one without is shown as the sentence you wrote. The first is the real
 * exercise and the second is what the method gives you for free, which is why adding a
 * FEN upgrades a card rather than creating one.
 */
function DrillBody({ userId }: { userId: string }) {
  const [patterns, setPatterns] = useState<PatternRecord[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [said, setSaid] = useState<PatternAnswer | null>(null)
  /** Answers from this session, layered over the queue rather than written back into it. */
  const [answered, setAnswered] = useState<Record<string, boolean>>({})
  const [now] = useState(() => Date.now())

  const load = useCallback(
    () =>
      getPatterns(userId)
        .then(loaded => {
          setPatterns(loaded)
          setLoadError(null)
        })
        .catch(caught => setLoadError(errorText(caught, 'Could not load your patterns.'))),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  /*
   * Taken once. Re-deriving it as answers land would re-sort the queue under you, which
   * is the rule the game drill already follows and for the same reason: the next card
   * must not move while you are looking at this one.
   */
  const queue = useMemo(
    () => (patterns ? dueCards(patterns, now) : []),
    [patterns, now],
  )
  const summary = useMemo(
    () => (patterns ? drillSummary(patterns, now) : null),
    [patterns, now],
  )

  if (loadError) return <LoadError message={loadError} onRetry={load} />
  if (!patterns) return <Spinner />

  const card: PatternCard | undefined = queue[index]
  const right = card && said !== null ? judge(card, said) : null

  async function answer(choice: PatternAnswer) {
    if (!card || said !== null) return
    setSaid(choice)

    const correct = judge(card, choice)
    setAnswered(current => ({ ...current, [card.key]: correct }))

    try {
      await savePatternDrill(
        userId,
        card.patternId,
        card.pointId,
        reschedule(card.stat, correct, Date.now()),
      )
    } catch {
      // the answer is on screen either way; a failed write costs this card's place in
      // the ladder, not the session
    }
  }

  const done = Object.keys(answered).length
  const got = Object.values(answered).filter(Boolean).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/patterns" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← All patterns
        </Link>
        {summary && (
          <span className="text-xs text-zinc-500">
            {summary.due} due of {summary.total}
            {summary.unseen > 0 && <span className="text-zinc-600"> · {summary.unseen} new</span>}
          </span>
        )}
      </div>

      {!card ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">
            {done > 0 ? `${got} of ${done} right` : 'Nothing due'}
          </h2>
          <p className="text-sm text-zinc-400 max-w-prose">
            {summary && summary.total === 0 ? (
              <>
                No boundaries written yet. A pattern earns cards from questions 3a and 3b —
                what would make it fail, and what it survives — so taking one apart is what
                fills this.
              </>
            ) : done > 0 ? (
              <>
                That is everything due. Each right answer pushes a card further out along{' '}
                {LADDER.join(', ')} days; a miss brings it back to tomorrow.
              </>
            ) : (
              <>
                Everything is scheduled ahead. Come back when something falls due, or add
                boundaries to a pattern to make more cards.
              </>
            )}
          </p>
          <Link
            href="/patterns"
            className="self-start px-4 py-2 text-xs rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white transition-colors"
          >
            Back to the patterns
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>
              {index + 1} of {queue.length}
            </span>
            {done > 0 && (
              <span className="text-zinc-600">
                · {got}/{done} right
              </span>
            )}
          </div>

          {/*
            The pattern is named and the change is not. Naming the change would be handing
            over the answer on a card that carries a board, and the whole exercise is
            finding what moved.
          */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-zinc-100">{card.patternName}</h2>
              <p className="text-sm text-zinc-500">
                {card.fen
                  ? 'Something has changed. Does the pattern still work here?'
                  : 'With this change, does the pattern still work?'}
              </p>
            </div>

            {card.fen ? (
              <div className="w-full max-w-[26rem]">
                <MoveTreeBoard
                  key={card.key}
                  tree={emptyTree(card.fen)}
                  path={[]}
                  onPath={() => {}}
                  orientation={sideToMove(card.fen)}
                />
              </div>
            ) : (
              <p className="text-[15px] leading-relaxed text-zinc-100 border-l-2 border-zinc-700 pl-4 py-1">
                {card.text}
              </p>
            )}

            {said === null ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => answer('works')}
                  className="px-4 py-2 text-sm rounded-lg border border-emerald-800/60 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/30 transition-colors"
                >
                  Still works
                </button>
                <button
                  type="button"
                  onClick={() => answer('fails')}
                  className="px-4 py-2 text-sm rounded-lg border border-rose-800/60 bg-rose-950/30 text-rose-200 hover:bg-rose-900/30 transition-colors"
                >
                  Breaks it
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      right ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {right ? 'Right' : 'No'}
                  </span>
                  <span className="text-sm text-zinc-400">
                    it {card.answer === 'works' ? 'still works' : 'breaks'} —{' '}
                    <span className="text-zinc-600">{card.section}</span>
                  </span>
                </div>

                {/*
                  Only where the board asked the question. On a card with a FEN the change
                  was deliberately not named, so naming it now is the answer; on a card
                  without one the sentence *was* the question and is already on screen, and
                  printing it again reads as the page having lost its place.
                */}
                {card.fen && (
                  <p className="text-[15px] leading-relaxed text-zinc-200">{card.text}</p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setSaid(null)
                      setIndex(current => current + 1)
                    }}
                    className="px-4 py-2 text-xs rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white transition-colors"
                  >
                    {index + 1 < queue.length ? 'Next' : 'Finish'}
                  </button>
                  <Link
                    href={`/patterns/${card.patternId}`}
                    className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    Open the write-up →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PatternDrillPage() {
  return (
    <PageShell title="Drill patterns">{user => <DrillBody userId={user.uid} />}</PageShell>
  )
}
