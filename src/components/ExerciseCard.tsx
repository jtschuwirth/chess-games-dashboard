'use client'

import { useState } from 'react'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import { toPlay } from '@/lib/exercise'
import { commentedNodes, fenIsValid, lineOrientation, parsePatternPgn } from '@/lib/pattern'
import { commentAt as setComment, moveLabel } from '@/lib/movetree'
import { useLineEditor } from '@/lib/use-line-editor'
import type { Exercise, PatternLine } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/**
 * One position to solve, with the board you solve it on.
 *
 * The whole exercise is a board and the space beside it: play the answer out, branch
 * where it depends on the reply, and write what each move is for. That is the pattern
 * example editor's job too, which is why the solution is a `PatternLine` — the board,
 * the variations, the PGN round trip and the comments arrive already working.
 *
 * It folds. A sheet is a dozen positions and all twelve boards open at once is a page
 * you scroll rather than work through; the fold shows the diagram's own name, whose move
 * it is and where you have got to, which is what you scan the sheet for.
 */
export default function ExerciseCard({
  exercise,
  index,
  open,
  onToggleOpen,
  onChange,
  onRemove,
}: {
  exercise: Exercise
  index: number
  open: boolean
  onToggleOpen: () => void
  onChange: (next: Exercise) => void
  onRemove: () => void
}) {
  /*
   * Two complaints, not one. A bad FEN and a bad line are different mistakes about
   * different boxes, and a single slot put "check the move notation" under the position
   * field — sending you to the box you did not touch.
   */
  const [fenError, setFenError] = useState<string | null>(null)
  const [pgnError, setPgnError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const { line } = exercise
  const setLine = (next: PatternLine) => onChange({ ...exercise, line: next })
  const editor = useLineEditor(line, setLine)
  const { tree, home, path, standing, stepTo, resetCursor } = editor

  /** A move played on the board replaces the line, so an old complaint about it goes. */
  function setTree(...args: Parameters<typeof editor.setTree>) {
    setPgnError(null)
    editor.setTree(...args)
  }

  /** The position. Kept whatever happens: half a pasted FEN is not a reason to lose it. */
  function setFen(startFen: string) {
    try {
      const moves = parsePatternPgn(line.pgn, startFen)
      setFenError(null)
      setPgnError(null)
      resetCursor()
      setLine({ ...line, startFen, moves })
    } catch {
      setFenError(
        !fenIsValid(startFen)
          ? 'That FEN will not read — check the position.'
          : 'Your moves do not play from this position.',
      )
      setLine({ ...line, startFen })
    }
  }

  /** The solution as text, so a line can be pasted rather than dragged move by move. */
  function setPgn(pgn: string) {
    try {
      const moves = parsePatternPgn(pgn, line.startFen)
      setPgnError(null)
      resetCursor()
      setLine({ ...line, pgn, moves })
    } catch (caught) {
      // the text is kept whatever happens: a typo mid-line must not throw away the rest
      setPgnError(caught instanceof Error ? caught.message : 'Could not read those moves.')
      setLine({ ...line, pgn })
    }
  }

  const notes = commentedNodes(tree)
  const moves = line.moves.length
  const title = line.title.trim() || `Exercise ${index + 1}`

  return (
    <div
      className={`border rounded-xl bg-zinc-900 transition-colors ${
        exercise.solved ? 'border-emerald-900/60' : 'border-zinc-800'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={`${open ? 'Close' : 'Open'} ${title}`}
          className="shrink-0 w-6 h-6 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors text-xs"
        >
          {open ? '−' : '+'}
        </button>

        <button type="button" onClick={onToggleOpen} className="text-sm text-zinc-100 min-w-0 truncate">
          {title}
        </button>

        <span className="text-xs text-zinc-500 shrink-0">
          {toPlay(exercise) === 'white' ? 'White to play' : 'Black to play'}
        </span>

        {/*
          What you have got to, which is the thing you scan a folded sheet for: a
          position you have not touched looks different from one you left half written.
        */}
        <span className="text-xs text-zinc-600 shrink-0">
          {moves > 0 ? `${moves} ${moves === 1 ? 'move' : 'moves'}` : 'nothing yet'}
        </span>

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={exercise.solved}
              onChange={event => onChange({ ...exercise, solved: event.target.checked })}
              className="accent-emerald-500"
            />
            Solved
          </label>
          {open && (
            <button
              type="button"
              onClick={() => (confirming ? onRemove() : setConfirming(true))}
              className={`text-xs transition-colors ${
                confirming ? 'text-red-400' : 'text-zinc-600 hover:text-red-400'
              }`}
            >
              {confirming ? 'Really remove?' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-4 items-start">
          <div className="w-full max-w-[26rem] mx-auto lg:mx-0 flex flex-col gap-2">
            {/*
              Editable, which is the whole exercise: you answer by playing the moves.
              `onTree` is what makes the board take input at all.
            */}
            <MoveTreeBoard
              tree={tree}
              path={path}
              onPath={stepTo}
              onTree={setTree}
              orientation={lineOrientation(line)}
              home={home}
            />
          </div>

          <div className="min-w-0 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <input
                value={line.title}
                onChange={event => setLine({ ...line, title: event.target.value })}
                placeholder={`Exercise ${index + 1}`}
                className={`${INPUT} text-sm`}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-zinc-500">
                Position <span className="normal-case text-zinc-600">— paste the FEN</span>
              </label>
              <textarea
                value={line.startFen ?? ''}
                onChange={event => setFen(event.target.value)}
                rows={2}
                className={`${INPUT} font-mono text-[11px] resize-y`}
              />
              {fenError && <span className="text-xs text-red-400">{fenError}</span>}
            </div>

            {/*
              The comment is for whichever move is on the board, so writing the solution
              up is play a move, say what it is for, play the next.
            */}
            {/*
              A comment belongs to a move, which is where PGN puts it and the only place
              that survives the round trip — the line's old per-ply map is dropped on
              write. What you want to say about the position itself goes in Notes below.
            */}
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-zinc-500">
                Why{' '}
                <span className="normal-case tracking-normal font-mono text-zinc-400">
                  {standing
                    ? moveLabel(tree.startFen, path.length - 1, standing.san, true)
                    : 'this move'}
                </span>
              </label>
              <textarea
                value={standing?.comment ?? ''}
                onChange={event => setTree(setComment(tree, path, event.target.value), path)}
                disabled={!standing}
                rows={2}
                placeholder={
                  standing ? 'what this move does' : 'play a move to write on it'
                }
                className={`${INPUT} resize-y disabled:opacity-40`}
              />
            </div>

            {/*
              The board is the main way in, but a solution often arrives as a line you
              want to paste — and dragging six moves to write one down is slower than
              typing them. Brackets are variations and braces are comments, both of which
              survive the round trip, so a line copied from anywhere keeps its shape.
            */}
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-zinc-500">
                Moves{' '}
                <span className="normal-case text-zinc-600">
                  — or play them on the board
                </span>
              </label>
              <textarea
                value={line.pgn}
                onChange={event => setPgn(event.target.value)}
                rows={2}
                placeholder="1... Nxd4 2. cxd4 (2. exd4 is met by) 2... Qxd4"
                className={`${INPUT} font-mono text-xs resize-y`}
              />
              {pgnError && <span className="text-xs text-red-400">{pgnError}</span>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Notes</label>
              <textarea
                value={line.note}
                onChange={event => setLine({ ...line, note: event.target.value })}
                rows={2}
                placeholder="the point of the exercise, what you missed, what to remember"
                className={`${INPUT} resize-y`}
              />
            </div>

            {notes.length > 0 && (
              <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
                {notes.map(note => (
                  <button
                    key={note.path.join('/')}
                    type="button"
                    onClick={() => stepTo(note.path)}
                    className={`text-left px-3 py-2 flex flex-col gap-0.5 transition-colors ${
                      path.join('/') === note.path.join('/')
                        ? 'bg-zinc-800/70'
                        : 'hover:bg-zinc-800/40'
                    }`}
                  >
                    <span className="text-[11px] font-mono text-zinc-500">
                      {moveLabel(tree.startFen, note.path.length - 1, note.san, true)}
                    </span>
                    <span className="text-sm text-zinc-200 whitespace-pre-wrap">{note.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
