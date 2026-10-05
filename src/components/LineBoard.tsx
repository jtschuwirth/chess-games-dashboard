'use client'

import { useMemo, useState } from 'react'
import Board from '@/components/Board'
import { plyLabel, replayGame, type Replay } from '@/lib/board'
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

export interface LineCursor {
  replay: Replay
  /** How many plies the line has. */
  total: number
  /** The ply the line opens on, clamped into the game. */
  home: number
  /** How many plies are played on the board right now. */
  cursor: number
  goTo: (ply: number) => void
}

/**
 * Where a line is being read, held outside the board.
 *
 * It lives here rather than inside `LineBoard` because what is worth saying about a line
 * belongs to one move of it, and whoever shows or edits that comment has to know which
 * move is on the board. Lifting the cursor is what lets the commentary sit beside the
 * board instead of being squeezed underneath it.
 *
 * `moved` is null until you actually step, so while you are still pointing the line in
 * the editor the board follows `startPly` as you change it, with no effect writing state
 * back into the component.
 */
export function useLineCursor(moves: string[], startPly: number): LineCursor {
  const [moved, setMoved] = useState<number | null>(null)

  const replay = useMemo(() => replayGame(moves), [moves])
  const total = replay.plies.length
  const home = Math.max(0, Math.min(startPly, total))
  const cursor = Math.max(0, Math.min(moved ?? home, total))

  return { replay, total, home, cursor, goTo: setMoved }
}

/**
 * What a point in a line is called — "7. Qc2", or "start" for the position before
 * anything. Used wherever a comment has to say which move it belongs to.
 */
export function plyName(replay: Replay, ply: number): string {
  if (ply <= 0) return 'start'
  const move = replay.plies[ply - 1]
  return move ? plyLabel(ply - 1, move.san) : 'start'
}

/**
 * Every move of the line, to jump to directly.
 *
 * Stepping is fine for reading a line through, and useless for finding the one move
 * someone wrote a note on — so the moves carrying a comment are marked, and any move is
 * one click away. The ply the line opens on keeps a ring, because that position is the
 * reason the line is here at all.
 */
function PlyStrip({
  nav,
  commented,
}: {
  nav: LineCursor
  commented: Set<number>
}) {
  function chip(ply: number, label: React.ReactNode) {
    const active = nav.cursor === ply
    return (
      <button
        key={ply}
        type="button"
        onClick={() => nav.goTo(ply)}
        className={`px-1.5 py-0.5 rounded font-mono text-[11px] leading-none transition-colors ${
          active
            ? 'bg-zinc-200 text-zinc-900'
            : `text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${
                ply === nav.home ? 'ring-1 ring-inset ring-zinc-700' : ''
              }`
        }`}
      >
        {label}
        {commented.has(ply) && (
          <span className={active ? 'text-amber-600' : 'text-amber-400'} aria-label="has a comment">
            {' '}
            •
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="max-h-24 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/60 p-1 flex flex-wrap gap-0.5">
      {chip(0, <span className="text-zinc-500">start</span>)}
      {nav.replay.plies.map((ply, index) =>
        chip(
          index + 1,
          <>
            {index % 2 === 0 && (
              <span className="text-zinc-600">{Math.floor(index / 2) + 1}.</span>
            )}
            {ply.san}
          </>,
        ),
      )}
    </div>
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
 * `⏮` returns to the pattern's own start rather than to move one. That position is the
 * reason the line is here, and stepping back past it is what `◀` is for.
 */
export default function LineBoard({
  nav,
  orientation = 'white',
  commented,
  onFlip,
  onSetStart,
}: {
  nav: LineCursor
  orientation?: Color
  /** Plies with something written on them, marked on the strip. */
  commented?: Set<number>
  /** Offered only when the caller can store the result. */
  onFlip?: () => void
  /** Edit mode: lets the move on screen become the one the line opens on. */
  onSetStart?: (ply: number) => void
}) {
  const { replay, total, home, cursor } = nav

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
          onClick={() => nav.goTo(home)}
          disabled={cursor === home}
          title="Back to where this line starts"
        >
          ⏮
        </NavButton>
        <NavButton
          onClick={() => nav.goTo(cursor - 1)}
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
          onClick={() => nav.goTo(cursor + 1)}
          disabled={cursor >= total}
          title="Next move"
        >
          ▶
        </NavButton>
        <NavButton
          onClick={() => nav.goTo(total)}
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

      {total > 0 && <PlyStrip nav={nav} commented={commented ?? new Set()} />}

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
