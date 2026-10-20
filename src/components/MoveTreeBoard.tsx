'use client'

import { useMemo } from 'react'
import Board, { type BoardMove } from '@/components/Board'
import {
  fenAt,
  moveLabel,
  nodeAt,
  nodesAlong,
  playAt,
  promoteAt,
  removeAt,
  type MoveNode,
  type MoveTree,
  type Path,
} from '@/lib/movetree'
import type { Color } from '@/types/chess'

/** How a branch is drawn. The caller says what each node is; this only colours it. */
export interface BranchStyle {
  /** Tailwind text colour for the move. */
  text: string
  /** What it is, for the title attribute. */
  label: string
}

const NAV = 'px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:hover:border-zinc-700'

/**
 * A board you can play on, with the whole tree of moves beside it.
 *
 * The one board component for anything that is a line rather than a position: the
 * game and its variations, a pattern's example, an opening's moves. It replaced
 * `LineBoard`, which could hold a single line with no branches and had its own idea
 * of a cursor.
 *
 * It owns no state. The cursor and the tree both live with whoever can save them,
 * which is the rule `LineBoard` already followed and for the same reason: whatever
 * shows or edits what is written on a move has to know which move is on the board.
 *
 * Editing is `onTree`. Without it the board is a reader, the move text is navigation
 * and nothing can be changed — which is most of the places it is used.
 */
export default function MoveTreeBoard({
  tree,
  path,
  onPath,
  onTree,
  orientation = 'white',
  onFlip,
  styleOf,
  /** Where `⏮` goes, for a line that does not start at move one. */
  home = [],
  footer,
}: {
  tree: MoveTree
  path: Path
  onPath: (path: Path) => void
  /** Omit to make the board read-only. */
  onTree?: (tree: MoveTree, path: Path) => void
  orientation?: Color
  onFlip?: () => void
  /** What each node is — the game, yours, a review's line. Default is undifferentiated. */
  styleOf?: (node: MoveNode, path: Path) => BranchStyle | null
  home?: Path
  /** Anything to show under the board, such as a clock or an evaluation. */
  footer?: React.ReactNode
}) {
  const nodes = nodesAlong(tree, path)
  const current = nodes[nodes.length - 1] ?? null
  const fen = fenAt(tree, path)
  const editable = onTree !== undefined

  /** The next move along the line you are standing on, for `▶`. */
  const forward = useMemo(() => {
    const children = path.length === 0 ? tree.children : (nodeAt(tree, path)?.children ?? [])
    return children[0] ?? null
  }, [tree, path])

  function play(move: BoardMove) {
    const played = playAt(tree, path, move)
    if (!played) return

    // a move already in the tree is followed rather than added again, so playing
    // through a line you have entered walks it and only a new move branches
    onPath(played.path)
    if (played.added && onTree) onTree(played.tree, played.path)
  }

  return (
    <div className="flex flex-col gap-2">
      <Board
        fen={fen}
        orientation={orientation}
        highlight={current ? [current.from, current.to] : []}
        onPlay={editable ? play : undefined}
      />

      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        <button
          type="button"
          onClick={() => onPath(home)}
          disabled={path.length === home.length}
          title={home.length > 0 ? 'Back to where this line starts' : 'Start'}
          className={NAV}
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => onPath(path.slice(0, -1))}
          disabled={path.length === 0}
          title="Back one move"
          className={NAV}
        >
          ◀
        </button>

        <span className="flex-1 min-w-0 text-center font-mono text-zinc-400 truncate">
          {current ? moveLabel(tree.startFen, path.length - 1, current.san, true) : 'start'}
        </span>

        <button
          type="button"
          onClick={() => forward && onPath([...path, forward.id])}
          disabled={!forward}
          title="Forward one move"
          className={NAV}
        >
          ▶
        </button>

        {onFlip && (
          <button type="button" onClick={onFlip} title="Flip the board" className={NAV}>
            ⇅
          </button>
        )}
      </div>

      {footer}

      {editable && path.length > 0 && (
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => {
              onTree(removeAt(tree, path), path.slice(0, -1))
              onPath(path.slice(0, -1))
            }}
            title="Remove this move and everything after it"
            className="text-zinc-600 hover:text-red-400 transition-colors"
          >
            remove this move
          </button>
          <button
            type="button"
            onClick={() => onTree(promoteAt(tree, path), path)}
            title="Move this line ahead of the one beside it"
            className="text-zinc-600 hover:text-zinc-200 transition-colors"
          >
            promote the line
          </button>
        </div>
      )}

      <MoveTreeText tree={tree} path={path} onPath={onPath} styleOf={styleOf} />
    </div>
  )
}

/**
 * The tree as text: the main line running on, each variation indented under the move
 * it replaces.
 *
 * The way a board's analysis panel draws one, and the reason is the same as it was
 * for the saved lines nested in the game's move list — a variation shown anywhere
 * else is a variation you only see when you happen to be standing on it.
 */
/**
 * How a branch is set off from the line it leaves: an indent, a rule, and a tint.
 *
 * The tint is the part that matters and the part that was missing. A long variation
 * wraps, and without a block behind it the second line of one branch reads as the next
 * branch down — which is exactly what made a tree of five lines unreadable. With it, a
 * branch is a shape you can see the edges of however far it runs.
 *
 * All three fade with depth rather than changing hue, because every colour here already
 * means something — red a blunder, amber a mistake, violet the engine, sky a selection —
 * and a rainbow of nesting levels would be four more things to decode on a panel you are
 * reading moves off. Past the third level they stop fading: the indent still grows, and
 * a rule you cannot see is worse than one that repeats.
 */
const BRANCH = [
  'border-zinc-500 bg-zinc-800/50',
  'border-zinc-600 bg-zinc-800/30',
  'border-zinc-700 bg-zinc-800/20',
] as const

/** The main line is read and the side lines are scanned, so they are not the same ink. */
const MOVE_INK = ['text-zinc-200', 'text-zinc-400', 'text-zinc-500'] as const

/**
 * One run of moves: the first child each time, its siblings branching under it.
 *
 * The same shape as `toPgn`, deliberately — a variation is written straight after the
 * move it replaces, it always carries its move number, and the move following a
 * branch carries its number again or it reads as part of the branch. Two renderings
 * of one tree that disagreed about which move a bracket replaced would be the worst
 * kind of bug to go looking for.
 *
 * Exported because the game's move list nests variations under the move they replace
 * rather than showing them in a panel of their own — the decision that put saved
 * lines in the move list in the first place, now serving every branch rather than
 * only the ones a review proposed.
 */
export function MoveRun({
  tree,
  nodes,
  prefix,
  ply,
  numberNext,
  path,
  onPath,
  styleOf,
  depth = 0,
}: {
  tree: MoveTree
  /** The moves at this point: the first is the line, the rest branch off it. */
  nodes: MoveNode[]
  /** The path to the position these are played from. */
  prefix: Path
  ply: number
  numberNext: boolean
  path: Path
  onPath: (path: Path) => void
  styleOf?: (node: MoveNode, path: Path) => BranchStyle | null
  /** How many branches deep this run is, which is what it is drawn from. */
  depth?: number
}) {
  if (nodes.length === 0) return null

  const [main, ...variations] = nodes
  const here = [...prefix, main.id]
  const style = styleOf?.(main, here) ?? null
  const active = here.join('/') === path.join('/')

  return (
    <>
      <button
        type="button"
        onClick={() => onPath(here)}
        title={style?.label}
        className={`px-1 rounded font-mono transition-colors ${
          active
            ? 'bg-zinc-200 text-zinc-900'
            : `${style?.text ?? MOVE_INK[Math.min(depth, MOVE_INK.length - 1)]} hover:bg-zinc-800`
        }`}
      >
        {moveLabel(tree.startFen, ply, main.san, numberNext)}
      </button>
      {main.comment?.trim() && (
        <span className="text-zinc-500 italic px-1">{main.comment.trim()}</span>
      )}{' '}
      {variations.map(variation => (
        <span
          key={variation.id}
          className={`block pl-2.5 pr-1 my-1 rounded-r border-l-2 leading-relaxed ${
            BRANCH[Math.min(depth, BRANCH.length - 1)]
          }`}
        >
          <MoveRun
            tree={tree}
            nodes={[variation]}
            prefix={prefix}
            ply={ply}
            numberNext
            path={path}
            onPath={onPath}
            styleOf={styleOf}
            depth={depth + 1}
          />
        </span>
      ))}
      <MoveRun
        tree={tree}
        nodes={main.children}
        prefix={here}
        ply={ply + 1}
        numberNext={variations.length > 0}
        path={path}
        onPath={onPath}
        styleOf={styleOf}
        depth={depth}
      />
    </>
  )
}

/**
 * The whole tree as text, main line running on and variations indented under the move
 * each replaces. For boards that are a line in their own right; the game's move list
 * uses `MoveRun` directly so it can keep its own rows.
 */
export function MoveTreeText({
  tree,
  path,
  onPath,
  styleOf,
}: {
  tree: MoveTree
  path: Path
  onPath: (path: Path) => void
  styleOf?: (node: MoveNode, path: Path) => BranchStyle | null
}) {
  if (tree.children.length === 0) {
    return <p className="text-xs text-zinc-600">No moves yet — play one on the board.</p>
  }

  return (
    <div className="text-xs leading-relaxed max-h-60 overflow-y-auto pr-1">
      <button
        type="button"
        onClick={() => onPath([])}
        className={`px-1 rounded font-mono transition-colors ${
          path.length === 0 ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-800'
        }`}
      >
        start
      </button>{' '}
      <MoveRun
        tree={tree}
        nodes={tree.children}
        prefix={[]}
        ply={0}
        numberNext
        path={path}
        onPath={onPath}
        styleOf={styleOf}
      />
    </div>
  )
}
