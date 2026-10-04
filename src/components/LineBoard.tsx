'use client'

import { useState } from 'react'
import Board from '@/components/Board'
import { plyLabel, replayGame } from '@/lib/board'
import type { Color } from '@/types/chess'

function NavButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:hover:bg-zinc-900 text-xs leading-none"
    >
      {children}
    </button>
  )
}

/**
 * A line of a pattern on a board: opens on the move the pattern is about, and steps
 * anywhere in the game from there.
 *
 * The cursor counts plies played, so `fens[cursor]` is what is on the board and
 * `plies[cursor - 1]` is the move that produced it — the one the readout names and the
 * board highlights.
 *
 * It is derived rather than stored: `moved` is null until you actually step, so while
 * you are still pointing the line in the editor the board follows `startPly` as you
 * change it, with no effect writing state back into the component.
 *
 * `⏮` returns to the pattern's own start rather than to move one. That position is the
 * reason the line is here, and stepping back past it is what `◀` is for.
 */
export default function LineBoard({
  moves,
  startPly,
  orientation = 'white',
  onFlip,
  onSetStart,
}: {
  moves: string[]
  startPly: number
  orientation?: Color
  /** Offered only when the caller can store the result. */
  onFlip?: () => void
  /** Edit mode: lets the move on screen become the one the line opens on. */
  onSetStart?: (ply: number) => void
}) {
  const [moved, setMoved] = useState<number | null>(null)

  const replay = replayGame(moves)
  const total = replay.plies.length
  const home = Math.max(0, Math.min(startPly, total))
  const cursor = Math.max(0, Math.min(moved ?? home, total))

  const current = cursor > 0 ? replay.plies[cursor - 1] : null
  const fen = replay.fens[cursor]

  if (!fen) {
    return (
      <div className="w-full aspect-square rounded-md border border-dashed border-zinc-800 flex items-center justify-center text-xs text-zinc-600">
        Paste a game to see it here
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Board
        fen={fen}
        orientation={orientation}
        highlight={current ? [current.from, current.to] : []}
      />

      <div className="flex items-center gap-1">
        <NavButton
          onClick={() => setMoved(home)}
          disabled={cursor === home}
          title="Back to where this line starts"
        >
          ⏮
        </NavButton>
        <NavButton
          onClick={() => setMoved(cursor - 1)}
          disabled={cursor === 0}
          title="Previous move"
        >
          ◀
        </NavButton>

        <span className="flex-1 text-center text-xs font-mono text-zinc-400 truncate">
          {current ? plyLabel(cursor - 1, current.san) : 'start'}
          <span className="text-zinc-600"> {cursor}/{total}</span>
        </span>

        <NavButton
          onClick={() => setMoved(cursor + 1)}
          disabled={cursor >= total}
          title="Next move"
        >
          ▶
        </NavButton>
        <NavButton
          onClick={() => setMoved(total)}
          disabled={cursor === total}
          title="Last move"
        >
          ⏭
        </NavButton>
        {onFlip && (
          <NavButton onClick={onFlip} title="Flip the board">
            ⇅
          </NavButton>
        )}
      </div>

      {onSetStart && (
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onSetStart(cursor)}
            disabled={cursor === home}
            className="px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors disabled:opacity-30"
          >
            Open here
          </button>
          <span className="text-zinc-600 truncate">
            {home === 0
              ? 'opens before the first move'
              : `opens on ${plyLabel(home - 1, replay.plies[home - 1]?.san ?? '')}`}
          </span>
        </div>
      )}
    </div>
  )
}
