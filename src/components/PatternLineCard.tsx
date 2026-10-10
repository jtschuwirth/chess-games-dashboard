'use client'

import { useMemo, useState } from 'react'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import { commentedNodes, lineHome, lineTree } from '@/lib/pattern'
import { moveLabel, type Path } from '@/lib/movetree'
import type { PatternLine } from '@/types/chess'

/**
 * One line, read rather than edited: the board on the left at the size you would
 * actually study at, and everything written about the line down the right.
 *
 * The commentary is a list rather than only the note for wherever you happen to be
 * standing. A line's annotations are the thing you came to read, and hunting for them
 * one move at a time is not reading. Clicking one puts its move on the board, which is
 * the same jump the move text under the board makes from the other direction.
 *
 * The cursor lives here rather than in the board for the same reason it always did:
 * whatever shows what is written on a move has to know which move is on the board.
 */
export default function PatternLineCard({
  line,
  fallbackTitle,
}: {
  line: PatternLine
  fallbackTitle: string
}) {
  const tree = useMemo(() => lineTree(line), [line])
  const home = useMemo(() => lineHome(tree, line.startPly), [tree, line.startPly])
  const [moved, setMoved] = useState<Path | null>(null)
  const path = moved ?? home

  const notes = useMemo(() => commentedNodes(tree), [tree])
  const standing = path.join('/')

  return (
    <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900 flex flex-col gap-3">
      <h3 className="text-sm font-medium text-zinc-100">{line.title.trim() || fallbackTitle}</h3>

      {/*
        Side by side only once there is room for the board at full size. At tablet width
        a two-column split squeezes the board back to what it was before it was made
        bigger, so below that the commentary goes under it instead.
      */}
      <div className="grid lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] gap-5 items-start">
        <div className="w-full max-w-[28rem] mx-auto lg:mx-0">
          <MoveTreeBoard
            tree={tree}
            path={path}
            onPath={setMoved}
            orientation={line.orientation ?? 'white'}
            home={home}
          />
        </div>

        <div className="min-w-0 flex flex-col gap-3">
          {line.note.trim().length > 0 && (
            <p className="text-sm text-zinc-400 whitespace-pre-wrap">{line.note}</p>
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
        </div>
      </div>
    </div>
  )
}
