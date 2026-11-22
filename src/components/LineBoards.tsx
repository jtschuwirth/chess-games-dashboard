'use client'

import { useMemo, useState } from 'react'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import { commentedNodes, lineHome, lineOrientation, lineTree } from '@/lib/pattern'
import { moveLabel, type Path } from '@/lib/movetree'
import type { PatternLine } from '@/types/chess'

/**
 * A line as something to read: the board, what is written on the whole thing, and what is
 * written on each move.
 *
 * Several lines are **chips over one board** rather than a column of boards. Three boards
 * down a page is three things to scroll past to compare two of them, and the question a
 * second example answers is "what does this look like somewhere else", which is a swap
 * rather than a list. Chips rather than a dropdown, since there are two or three of these
 * and a dropdown hides how many there are behind a press.
 *
 * The commentary is a list beside the board rather than only the comment for wherever you
 * happen to be standing: a line's annotations are what you came to read, and finding them
 * by stepping through eighteen moves is not reading. Pressing one puts its move on the
 * board, so the two directions meet.
 */
export default function LineBoards({
  lines,
  /**
   * Whether the commentary sits beside the board or under it.
   *
   * Under it by default, which is what a board already pinned in its own narrow column
   * wants — a split inside 26rem squeezes the board back to the size it was before it was
   * made bigger. A panel with the width of the page passes `split`, where the alternative
   * is a board with an empty half-page beside it.
   */
  split = false,
}: {
  lines: PatternLine[]
  split?: boolean
}) {
  const [shown, setShown] = useState(0)

  if (lines.length === 0) return null

  const at = Math.min(shown, lines.length - 1)
  const line = lines[at]

  return (
    <div className="flex flex-col gap-3">
      {lines.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {lines.map((entry, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setShown(index)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                index === at
                  ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {entry.title.trim() || `Example ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      {lines.length === 1 && line.title.trim().length > 0 && (
        <h3 className="text-sm font-medium text-zinc-300">{line.title}</h3>
      )}

      {/* keyed by which line is showing, so the cursor goes home when you swap */}
      <OneBoard key={at} line={line} split={split} />
    </div>
  )
}

/**
 * One line on a board, with its own cursor.
 *
 * The cursor lives out here rather than inside the board for the reason it always has:
 * whatever shows what is written on a move has to know which move is on the board.
 */
function OneBoard({ line, split }: { line: PatternLine; split: boolean }) {
  const tree = useMemo(() => lineTree(line), [line])
  const home = useMemo(() => lineHome(tree, line.startPly), [tree, line.startPly])
  const [moved, setMoved] = useState<Path | null>(null)
  const path = moved ?? home

  const notes = useMemo(() => commentedNodes(tree), [tree])
  const standing = path.join('/')

  const written = (
    <>
      {line.note.trim().length > 0 && (
        <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">{line.note}</p>
      )}

      {notes.length > 0 && (
        <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
          {notes.map(note => (
            <button
              key={note.path.join('/')}
              type="button"
              onClick={() => setMoved(note.path)}
              className={`text-left px-3 py-2 flex flex-col gap-0.5 transition-colors ${
                standing === note.path.join('/') ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/40'
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
    </>
  )

  const board = (
    <MoveTreeBoard
      tree={tree}
      path={path}
      onPath={setMoved}
      orientation={lineOrientation(line)}
      home={home}
    />
  )

  if (!split) {
    return (
      <div className="flex flex-col gap-3">
        {board}
        {written}
      </div>
    )
  }

  return (
    // the split waits for `lg` rather than `md`: at tablet width a two-column row squeezes
    // the board back to the 20rem it was before it was made bigger, which is the opposite
    // of the point, so below that the commentary stacks underneath
    <div className="grid lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] gap-4 items-start">
      <div className="w-full max-w-[28rem] mx-auto lg:mx-0">{board}</div>
      <div className="min-w-0 flex flex-col gap-3">
        {notes.length === 0 && line.note.trim().length === 0 ? (
          <p className="text-sm text-zinc-600">
            Nothing written on these moves yet — step to one and the comment goes on it.
          </p>
        ) : (
          written
        )}
      </div>
    </div>
  )
}
