/**
 * One game as one tree: what was played, what you have played out since, and every
 * line your review proposes.
 *
 * Before this there were two mechanisms and they disagreed. The move list replayed a
 * review's `betterMoves` into a throwaway `Variation` object with its own cursor, its
 * own stepping rules and its own way of falling back to the game — visible only while
 * you happened to be standing on the branch ply, and holding exactly one line with no
 * branches of its own. Separately, there was no way to play a move at all.
 *
 * Now there is one tree and the board, the move list and the controls all read it.
 * The game's own moves are its main line and stay that way: the game happened, and
 * nothing here can change what was played.
 *
 * Everything is merged on read rather than stored twice. A review alternative lives
 * where it always lived, on the entry, so the tags, the drills and the pattern pages
 * are untouched; it appears here because `addLine` follows a move already in the tree
 * instead of duplicating it, so the same line from two sources is one branch.
 */
import {
  addLine,
  fromPgn,
  mainPath,
  mergeTrees,
  nodeAt,
  treeFromMoves,
  walk,
  type MoveTree,
  type Path,
} from '@/lib/movetree'
import { betterMovesOf, moveNotesOf } from '@/lib/review'
import type { GameRecord } from '@/types/chess'

/** Where a branch in a game's tree came from, which is how it is drawn. */
export type BranchSource = 'game' | 'yours' | 'review' | 'note'

/**
 * The lines a review proposes, each with the ply it is an alternative to.
 *
 * Both kinds of entry: a mistake's "what would I play instead" and a note's "what
 * else was I choosing between". They are alternatives to the move of their entry, so
 * they graft at the position that move was played in.
 */
export function proposedLines(game: GameRecord): { ply: number; line: string[] }[] {
  const out: { ply: number; line: string[] }[] = []

  for (const mistake of game.review?.mistakes ?? []) {
    for (const move of betterMovesOf(mistake)) {
      if (move.line.length > 0) out.push({ ply: mistake.ply, line: move.line })
    }
  }

  for (const note of moveNotesOf(game.review)) {
    for (const move of note.alternatives ?? []) {
      if (move.line.length > 0) out.push({ ply: note.ply, line: move.line })
    }
  }

  return out
}

/**
 * The game, your saved variations and the review's lines, as one tree.
 *
 * `variationsPgn` carries the whole game plus whatever you played out on it, so it is
 * the tree whenever it exists; the game's move list rebuilds it otherwise. The stored
 * copy is merged *into* a tree built from `game.moves` rather than used directly, so
 * the moves actually played are always the main line even if the stored PGN has
 * drifted — a stored branch can never rewrite what happened.
 */
export function gameTree(game: GameRecord): MoveTree {
  let tree = treeFromMoves(game.moves)

  if (game.variationsPgn) {
    tree = mergeTrees(tree, fromPgn(game.variationsPgn))
  }

  for (const proposed of proposedLines(game)) {
    // an alternative to the move at `ply` is played from the position before it
    tree = addLine(tree, mainPath(tree, proposed.ply), proposed.line).tree
  }

  return tree
}

/**
 * Which branches came from where, by node id.
 *
 * Derived by walking the tree once and marking: the main line is the game, anything
 * reachable along a proposed line is the review's, the rest is yours. A node can be
 * reached by more than one of these — you may have played out the move your review
 * already proposed — and the review wins, because that is the more specific thing to
 * say about it.
 */
export function branchSources(game: GameRecord, tree: MoveTree): Map<string, BranchSource> {
  const sources = new Map<string, BranchSource>()

  // the game as played
  let path = mainPath(tree, game.moves.length)
  for (const id of path) sources.set(id, 'game')

  // everything else is yours until a review claims it
  for (const { node } of walk(tree)) {
    if (!sources.has(node.id)) sources.set(node.id, 'yours')
  }

  const noteyPlies = new Set(moveNotesOf(game.review).map(note => note.ply))

  for (const proposed of proposedLines(game)) {
    path = mainPath(tree, proposed.ply)
    const kind: BranchSource = noteyPlies.has(proposed.ply) ? 'note' : 'review'

    for (const san of proposed.line) {
      const parent = path.length === 0 ? tree.children : (nodeAt(tree, path)?.children ?? [])
      const next = parent.find(child => child.san === san)
      if (!next) break
      // never over-paint the game itself: a proposed line that transposes back into
      // the moves actually played is still, there, the game
      if (sources.get(next.id) !== 'game') sources.set(next.id, kind)
      path = [...path, next.id]
    }
  }

  return sources
}

/** Which plies of the game's own main line a path has in common with it. */
export function onMainLine(tree: MoveTree, path: Path, gamePlies: number): boolean {
  const main = mainPath(tree, gamePlies)
  return path.every((id, at) => main[at] === id)
}
