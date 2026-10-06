'use client'

import { useEffect, useRef } from 'react'
import { lineTokens, type Ply } from '@/lib/board'
import { markColor } from '@/lib/review'
import type { Color, ProposedMove } from '@/types/chess'

/** Which move of which line is on the board, when one is being played out. */
export interface ActiveLine {
  ply: number
  lineIndex: number
  moveIndex: number
}

/**
 * The game's moves, two per row, with the lines you proposed in review nested under the
 * move they replace — where a board's analysis panel puts a variation, rather than off
 * under the board where you have to be standing on the right move to see it.
 *
 * Every move of a line is clickable, so a line can be joined part way rather than only
 * played from its start.
 */
export default function MoveList({
  plies,
  current,
  onPick,
  tags,
  reviewed,
  secondsByPly,
  yourColor,
  linesByPly,
  onPlayLine,
  active,
}: {
  plies: Ply[]
  /** Ply index on the board, or -1 for the starting position. */
  current: number
  onPick: (index: number) => void
  /** Engine mark per ply, for your moves only. */
  tags: Map<number, string>
  /** Plies that appear in your review. */
  reviewed: Set<number>
  /** Seconds spent per ply, both sides, where the game carries clock readings. */
  secondsByPly: Map<number, number>
  /** The side you played, so a hover can say whose think a number is. */
  yourColor: Color
  /** The lines you would have played instead, keyed by the ply they branch at. */
  linesByPly: Map<number, ProposedMove[]>
  onPlayLine: (ply: number, lineIndex: number, moveIndex: number) => void
  /** Null while the board is following the game. */
  active: ActiveLine | null
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLButtonElement | null>(null)

  /**
   * Stepping should not leave the move off screen, and should not move the page either.
   *
   * `scrollIntoView` was the obvious way to do the first and is what caused the second:
   * it scrolls every scrollable ancestor up to the document, so on a phone — where the
   * list is stacked under the board rather than beside it — advancing a move dragged the
   * board off the top of the screen to bring the move list into view. Every move of a
   * game did it, which made stepping through one unusable.
   *
   * So the list is scrolled by hand and nothing else is touched. The rule is
   * `scrollIntoView`'s own `block: 'nearest'`: a move already in view stays where it is,
   * and one past either edge is brought just inside it. Measured with rectangles rather
   * than `offsetTop`, which would be relative to whichever ancestor happens to be
   * positioned — and that differs between the phone layout and the desktop one.
   */
  useEffect(() => {
    const list = listRef.current
    const move = activeRef.current
    if (!list || !move) return

    const listBox = list.getBoundingClientRect()
    const moveBox = move.getBoundingClientRect()

    const above = moveBox.top - listBox.top
    const below = moveBox.bottom - listBox.bottom

    if (above < 0) list.scrollTop += above
    else if (below > 0) list.scrollTop += below
  }, [current, active])

  const rows = Math.ceil(plies.length / 2)

  /** The lines branching at a ply, rendered under the row that holds it. */
  function linesFor(ply: Ply | undefined) {
    if (!ply) return []
    return (linesByPly.get(ply.index) ?? [])
      .map((move, lineIndex) => ({ ply: ply.index, lineIndex, move }))
      .filter(entry => entry.move.line.length > 0)
  }

  return (
    <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto text-sm font-mono">
      {Array.from({ length: rows }, (_, row) => {
        const white = plies[row * 2]
        const black = plies[row * 2 + 1]
        const branches = [...linesFor(white), ...linesFor(black)]

        return (
          <div key={row}>
            <div className="grid grid-cols-[2.25rem_1fr_1fr] border-b border-zinc-800/60">
              <span className="px-2 py-1 text-xs text-zinc-600 tabular-nums">{row + 1}.</span>
              {[white, black].map((ply, column) =>
                ply ? (
                  <button
                    key={column}
                    ref={ply.index === current && !active ? activeRef : undefined}
                    onClick={() => onPick(ply.index)}
                    title={
                      secondsByPly.has(ply.index)
                        ? `${ply.color === yourColor ? 'You' : 'Your opponent'} took ${secondsByPly.get(
                            ply.index,
                          )}s on this move`
                        : undefined
                    }
                    className={`px-2 py-1 text-left transition-colors ${
                      ply.index === current && !active
                        ? 'bg-zinc-700 text-zinc-50'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {ply.san}
                    {tags.has(ply.index) && (
                      <span className={markColor(tags.get(ply.index))}>
                        {tags.get(ply.index)}
                      </span>
                    )}
                    {reviewed.has(ply.index) && (
                      <span className="text-sky-400 ml-1" title="In your review">
                        ◆
                      </span>
                    )}
                  </button>
                ) : (
                  <span key={column} />
                ),
              )}
            </div>

            {branches.map(branch => (
              <div
                key={`${branch.ply}-${branch.lineIndex}`}
                className="border-b border-zinc-800/60 bg-sky-500/5 px-2 py-1.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
                  <span className="text-sky-700" aria-hidden="true">
                    ↳
                  </span>
                  {lineTokens(branch.ply, branch.move.line).map((token, moveIndex) => {
                    const isActive =
                      active?.ply === branch.ply &&
                      active.lineIndex === branch.lineIndex &&
                      active.moveIndex === moveIndex

                    return (
                      <button
                        key={moveIndex}
                        ref={isActive ? activeRef : undefined}
                        onClick={() => onPlayLine(branch.ply, branch.lineIndex, moveIndex)}
                        title="Play your line out on the board"
                        className={`rounded px-1 transition-colors ${
                          isActive
                            ? 'bg-sky-500/30 text-sky-100'
                            : 'text-sky-400 hover:bg-sky-500/15 hover:text-sky-200'
                        }`}
                      >
                        {token.prefix && <span className="text-zinc-600">{token.prefix} </span>}
                        {token.san}
                      </button>
                    )
                  })}
                </div>

                {branch.move.why && (
                  <p className="font-sans text-[11px] leading-snug text-zinc-500 mt-1">
                    {branch.move.why}
                  </p>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
