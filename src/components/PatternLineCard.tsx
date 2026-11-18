'use client'

import { useMemo, useState } from 'react'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import { playLabel, sideToMove } from '@/lib/board'
import { fenAt, mainPath, sansAlong, treeFromMoves, type MoveTree, type Path } from '@/lib/movetree'
import { yoursAt, type LineCard } from '@/lib/pattern-drill'

/**
 * Play the line, which is what an opening pattern is actually for.
 *
 * The boundary question — does the pattern still work here — is the right one for a
 * tactic, where the pattern is a shape you either see or you miss. An opening pattern
 * is not a shape: it is a sequence you are supposed to know, so the useful test is the
 * position in front of you and nothing else, and the moves asked for one at a time.
 *
 * **What it tells you before you start is the whole of the prompt**: the idea's own
 * name and the saved lines it belongs to. Without them a board out of its game is a
 * guess at which of your openings this even is; with them it is the thing you wrote the
 * pattern down to remember. What it withholds is the example's own title and note,
 * which usually say what the line *does* — that is the answer.
 *
 * Their replies come from the example you wrote, and the board says so by playing them
 * for you rather than waiting. A line where they played something else is a different
 * example, which is the honest limit of drilling against a line you recorded.
 */
export default function PatternLineCard({
  card,
  openings,
  onAnswered,
  children,
}: {
  card: LineCard
  /** The names of the saved lines this pattern is filed under, resolved by the page. */
  openings: string[]
  /** Called once, the first time the line is finished or given up on. */
  onAnswered: (correct: boolean) => void
  /** The page's own controls for moving on, shown once it is over. */
  children: (over: boolean) => React.ReactNode
}) {
  /**
   * How much of the line is on the board.
   *
   * An example pointed at the opponent's move opens with their move already played,
   * which is the same thing that happens at every other step. Decided once, in a lazy
   * initialiser, like every other arrival state here.
   */
  const [played, setPlayed] = useState(() => (yoursAt(card, 0) ? 0 : 1))
  const [outcome, setOutcome] = useState<'playing' | 'right' | 'wrong' | 'shown'>('playing')
  /** The move you played that was not the line's, named in the reveal. */
  const [missed, setMissed] = useState<string | null>(null)

  const over = outcome !== 'playing'
  /* while you are playing, only what you have got right; afterwards, the whole line */
  const shown = over ? card.moves : card.moves.slice(0, played)
  const tree = useMemo(() => treeFromMoves(shown, card.fen), [shown, card.fen])
  const path = useMemo(() => mainPath(tree, shown.length), [tree, shown.length])

  function finish(outcome: 'right' | 'wrong' | 'shown', move?: string) {
    setOutcome(outcome)
    if (move) setMissed(move)
    onAnswered(outcome === 'right')
  }

  /**
   * A move played on the board, judged against the line and then thrown away.
   *
   * The board is derived from how far you have got rather than kept, so a wrong move
   * never has to be unwound: the next render draws the line as it stands, or the whole
   * of it once the card is over.
   */
  function onTree(next: MoveTree, at: Path) {
    if (over) return
    const sans = sansAlong(next, at)
    const move = sans[played]
    if (!move) return

    if (move !== card.moves[played]) {
      finish('wrong', move)
      return
    }

    // their reply comes from the example, so it is played rather than waited for
    let ahead = played + 1
    if (ahead < card.moves.length && !yoursAt(card, ahead)) ahead += 1

    setPlayed(ahead)
    if (ahead >= card.moves.length) finish('right')
  }

  const asked = card.moves.filter((_, at) => yoursAt(card, at)).length
  const found = card.moves.slice(0, played).filter((_, at) => yoursAt(card, at)).length

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-zinc-100">{card.patternName}</h2>
        <p className="text-sm text-zinc-500">
          {over ? 'The line as you wrote it.' : 'Play the line from here, a move at a time.'}
        </p>
        {openings.length > 0 && (
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-600">in </span>
            {openings.join(' · ')}
          </p>
        )}
      </div>

      <div className="w-full max-w-[26rem] flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          {/* a position out of its game is unreadable without this, and it is read off
              the board so it keeps telling the truth as the line is played out */}
          <span className="text-xs text-zinc-400">
            {playLabel(sideToMove(fenAt(tree, path)))}
          </span>
          <span className="text-xs text-zinc-600 tabular-nums">
            {found} of {asked}
          </span>
        </div>

        <MoveTreeBoard
          key={card.key}
          tree={tree}
          path={path}
          onPath={() => {}}
          onTree={onTree}
          // the tree is the question: `remove this move` would delete what is being asked
          edits={false}
          orientation={card.orientation}
        />
      </div>

      {over ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium ${
                outcome === 'right' ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {outcome === 'right' ? 'Right' : outcome === 'shown' ? 'Shown' : 'No'}
            </span>
            {missed && (
              <span className="text-sm text-zinc-400">
                you played {missed}, the line goes {card.moves[played]}
              </span>
            )}
          </div>

          {/*
            The title and the note say what the line is *for*, which is why they are
            held back until it has been played or given up on. The moves themselves are
            not printed again: the board's own strip is already the whole line, and it
            is the clickable one.
          */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-zinc-600">
              {card.title || 'The line'}
            </span>
            {card.note && (
              <p className="text-[15px] leading-relaxed text-zinc-300">{card.note}</p>
            )}
          </div>

          {children(true)}
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => finish('shown')}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
          >
            Show me
          </button>
          {children(false)}
        </div>
      )}
    </div>
  )
}
