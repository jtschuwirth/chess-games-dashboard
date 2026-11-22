'use client'

import { useState } from 'react'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import {
  START_FEN,
  commentAt as setComment,
  mainLine,
  moveLabel,
  onMainLine,
  type MoveTree,
  type Path,
} from '@/lib/movetree'
import { useLineEditor } from '@/lib/use-line-editor'
import {
  clampStartPly,
  fenIsValid,
  lineOrientation,
  parsePatternPgn,
} from '@/lib/pattern'
import type { PatternLine } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="text-xs uppercase tracking-wide text-zinc-500">
      {children}
      {hint && <span className="normal-case tracking-normal text-zinc-600"> — {hint}</span>}
    </span>
  )
}

/**
 * Writing one line up on a board: the moves, the position it plays from, and what each
 * move is for.
 *
 * It was `LineFields` inside the pattern form, and it is here because a line is not a
 * pattern's alone — an exercise's solution, a model game and now a study's board are the
 * same thing, a PGN kept whole with a position under it and a comment on any move. The
 * pattern form renders this, so there is one of them rather than two to get wrong, which
 * is the same bargain `useLineEditor` already made with the cursor.
 *
 * The comment field is for whichever move is on the board, so writing a line up is
 * stepping and typing rather than filling in a list of moves you have to name.
 */
export default function LineEditor({
  line,
  titlePlaceholder,
  notePlaceholder = 'Black gets ...c5 in before White can hold the centre',
  onChange,
  onRemove,
}: {
  line: PatternLine
  titlePlaceholder: string
  notePlaceholder?: string
  onChange: (next: PatternLine) => void
  onRemove?: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  /*
   * The cursor lives in `useLineEditor`, which every line editor shares. It is held as
   * the moves leading to it rather than the ids along the way, for the reason documented
   * there — the ids are re-minted on every PGN round trip.
   */
  const { tree, home, path, standing, stepTo, setTree: applyTree, resetCursor } =
    useLineEditor(line, onChange)

  /** An edit on the board becomes the stored line, and clears any parse complaint. */
  function setTree(next: MoveTree, at: Path) {
    setError(null)
    applyTree(next, at)
  }

  /** Whether this is a position with moves on it, or a whole game. */
  const fromPosition = line.startFen !== undefined

  function setPgn(pgn: string) {
    // The PGN is kept whatever happens, so a typo does not throw away what you pasted.
    try {
      const moves = parsePatternPgn(pgn, line.startFen)
      setError(null)
      resetCursor()
      onChange({ ...line, pgn, moves, startPly: clampStartPly(line.startPly, moves) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that PGN.')
      onChange({ ...line, pgn })
    }
  }

  /**
   * The position is kept whatever happens, the same as the PGN: half a pasted FEN is not
   * a reason to lose the half that arrived. The moves are re-read from the new position,
   * since a line written for one position rarely plays from another.
   */
  function setFen(startFen: string) {
    try {
      const moves = parsePatternPgn(line.pgn, startFen)
      setError(null)
      resetCursor()

      // the orientation is not written here: `lineOrientation` derives it from this
      // position, so the stored field only ever holds a flip you asked for
      onChange({ ...line, startFen, moves, startPly: clampStartPly(line.startPly, moves) })
    } catch {
      // the field being edited is the position, so the complaint has to be about that:
      // "check the move notation" sends you to the box you did not touch — which is why
      // the thrown message is replaced rather than shown
      setError(
        !fenIsValid(startFen)
          ? 'Invalid FEN — check the position and try again.'
          : 'Those moves do not play from this position.',
      )
      onChange({ ...line, startFen })
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] gap-4 border border-zinc-800 rounded-xl p-3 bg-zinc-950/40">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <input
            value={line.title}
            onChange={event => onChange({ ...line, title: event.target.value })}
            placeholder={titlePlaceholder}
            className={`${INPUT} flex-1 min-w-0`}
          />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors shrink-0"
            >
              Remove
            </button>
          )}
        </div>

        {fromPosition && (
          <div className="flex flex-col gap-1.5">
            <Label hint="the moves below are played from here">Position</Label>
            <textarea
              value={line.startFen ?? ''}
              onChange={event => setFen(event.target.value)}
              rows={2}
              placeholder={START_FEN}
              className={`${INPUT} font-mono resize-y`}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label
            hint={
              fromPosition
                ? 'the moves from the position above — a position on its own is a complete example'
                : 'brackets are variations, braces are comments — both survive a round trip'
            }
          >
            {fromPosition ? 'Moves' : 'PGN'}
          </Label>
          <textarea
            value={line.pgn}
            onChange={event => setPgn(event.target.value)}
            rows={fromPosition ? 3 : 5}
            placeholder={
              fromPosition ? 'Qxh7+ Kxh7 Rh3#' : '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4'
            }
            className={`${INPUT} font-mono resize-y`}
          />
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : (
            line.moves.length > 0 && (
              <span className="text-xs text-zinc-600">{line.moves.length} half-moves read</span>
            )
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Note</Label>
          <textarea
            value={line.note}
            onChange={event => onChange({ ...line, note: event.target.value })}
            rows={2}
            placeholder={notePlaceholder}
            className={`${INPUT} resize-y`}
          />
        </div>
      </div>

      <div className="w-full max-w-[26rem] mx-auto lg:mx-0 flex flex-col gap-3">
        {/*
          The same board the game view uses. Playing a move here extends the line, or
          branches it where it differs — a line usually has an "if they play this
          instead" in it, and before the tree there was nowhere to put one.
        */}
        <MoveTreeBoard
          tree={tree}
          path={path}
          onPath={stepTo}
          onTree={setTree}
          orientation={lineOrientation(line)}
          onFlip={() =>
            onChange({
              ...line,
              orientation: lineOrientation(line) === 'white' ? 'black' : 'white',
            })
          }
          home={home}
        />

        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => onChange({ ...line, startPly: path.length })}
            disabled={path.length === home.length || !onMainLine(tree, path)}
            title={
              onMainLine(tree, path)
                ? 'Open the line on this move'
                : 'A line opens on its own moves, not inside a variation'
            }
            className="text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:hover:text-zinc-500"
          >
            open here
          </button>
          <span className="text-zinc-600">
            {line.startPly === 0
              ? fromPosition
                ? 'opens on the position'
                : 'opens before the first move'
              : `opens on ${moveLabel(
                  tree.startFen,
                  line.startPly - 1,
                  mainLine(tree)[line.startPly - 1] ?? '',
                  true,
                )}`}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          {/* the move is mono and in its own case — "QC2" is not a move */}
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Comment on{' '}
            <span className="normal-case tracking-normal font-mono text-zinc-400">
              {standing ? moveLabel(tree.startFen, path.length - 1, standing.san, true) : 'start'}
            </span>
          </span>
          <textarea
            value={standing?.comment ?? ''}
            onChange={event => setTree(setComment(tree, path, event.target.value), path)}
            disabled={!standing}
            rows={3}
            placeholder={standing ? 'what this move is for' : 'step to a move to write on it'}
            className={`${INPUT} resize-y disabled:opacity-40`}
          />
        </div>
      </div>
    </div>
  )
}
