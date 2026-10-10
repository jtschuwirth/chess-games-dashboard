'use client'

import { useEffect, useRef } from 'react'
import { MoveRun, type BranchStyle } from '@/components/MoveTreeBoard'
import { type Ply } from '@/lib/board'
import { mainPath, nodeAt, type MoveNode, type MoveTree, type Path } from '@/lib/movetree'
import { markColor } from '@/lib/review'
import type { Color } from '@/types/chess'

/**
 * The game's moves, two per row, with every variation nested under the move it
 * replaces — where a board's analysis panel puts one, rather than off under the board
 * where you have to be standing on the right move to see it.
 *
 * It used to nest only the lines a review proposed, replayed through a bespoke
 * `Variation` object with its own cursor and its own stepping rules. Now there is one
 * tree holding the game, the lines you have played out and the ones your review
 * proposes, and this renders whatever is in it. Every move of every branch is
 * clickable, so a line can be joined part way rather than only played from its start.
 */
export default function MoveList({
  plies,
  current,
  onBranch,
  onPick,
  tags,
  reviewed,
  secondsByPly,
  yourColor,
  tree,
  path,
  onPath,
  styleOf,
}: {
  plies: Ply[]
  /** Ply index on the board, or -1 for the starting position. */
  current: number
  /** True when the board has left the game, so no played move is the one on screen. */
  onBranch: boolean
  onPick: (index: number) => void
  /** Engine mark per ply, for your moves only. */
  tags: Map<number, string>
  /** Plies that appear in your review. */
  reviewed: Set<number>
  /** Seconds spent per ply, both sides, where the game carries clock readings. */
  secondsByPly: Map<number, number>
  /** The side you played, so a hover can say whose think a number is. */
  yourColor: Color
  /** The game and everything branching off it. */
  tree: MoveTree
  path: Path
  onPath: (path: Path) => void
  styleOf?: (node: MoveNode, path: Path) => BranchStyle | null
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
  }, [current, onBranch])

  const rows = Math.ceil(plies.length / 2)

  /**
   * What branches off a ply: every move at that point except the one that was played.
   *
   * A variation replaces a move, so it is a sibling of it — the children of the
   * position *before* the ply, minus the first, which is the game. Read off the tree
   * rather than from a second list, so a line you played out on the board and a line
   * your review proposes arrive here the same way.
   */
  function branchesAt(ply: Ply | undefined) {
    if (!ply) return []
    const prefix = mainPath(tree, ply.index)
    const siblings = prefix.length === 0 ? tree.children : (nodeAt(tree, prefix)?.children ?? [])
    return siblings.slice(1).map(node => ({ node, prefix, ply: ply.index }))
  }

  return (
    <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto text-sm font-mono">
      {Array.from({ length: rows }, (_, row) => {
        const white = plies[row * 2]
        const black = plies[row * 2 + 1]
        const branches = [...branchesAt(white), ...branchesAt(black)]

        return (
          <div key={row}>
            <div className="grid grid-cols-[2.25rem_1fr_1fr] border-b border-zinc-800/60">
              <span className="px-2 py-1 text-xs text-zinc-600 tabular-nums">{row + 1}.</span>
              {[white, black].map((ply, column) =>
                ply ? (
                  <button
                    key={column}
                    ref={ply.index === current && !onBranch ? activeRef : undefined}
                    onClick={() => onPick(ply.index)}
                    title={
                      secondsByPly.has(ply.index)
                        ? `${ply.color === yourColor ? 'You' : 'Your opponent'} took ${secondsByPly.get(
                            ply.index,
                          )}s on this move`
                        : undefined
                    }
                    className={`px-2 py-1 text-left transition-colors ${
                      ply.index === current && !onBranch
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
                key={branch.node.id}
                className="border-b border-zinc-800/60 bg-sky-500/5 px-2 py-1.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-xs">
                  <span className="text-sky-700 shrink-0" aria-hidden="true">
                    ↳
                  </span>
                  <MoveRun
                    tree={tree}
                    nodes={[branch.node]}
                    prefix={branch.prefix}
                    ply={branch.ply}
                    numberNext
                    path={path}
                    onPath={onPath}
                    styleOf={styleOf}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
