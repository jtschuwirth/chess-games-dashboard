import { Chess } from 'chess.js'
import type { GameRecord, PatternColor, PatternRecord } from '@/types/chess'

/**
 * How deep into a game we look for the pattern position. Openings transpose long
 * before move 30, and this bounds the replay cost when a few hundred games load.
 */
export const MAX_PATTERN_PLY = 60

/**
 * Piece placement + side to move + castling rights: the first three FEN fields.
 * Dropping the move counters is what lets a transposition match; dropping the
 * en-passant square avoids a spurious mismatch between the same position reached
 * with and without a double pawn push.
 */
export function positionKey(fen: string): string {
  const [placement, turn, castling] = fen.split(' ')
  return `${placement} ${turn} ${castling}`
}

export interface ParsedPattern {
  moves: string[]
  positionKey: string
  ply: number
}

/** Turns a pasted line like "1. e4 c6 2. d4 d5" into moves + the position it reaches. */
export function parsePattern(pgn: string): ParsedPattern {
  const chess = new Chess()

  try {
    chess.loadPgn(pgn.trim())
  } catch {
    throw new Error('Invalid PGN — check the move notation and try again.')
  }

  const moves = chess.history()
  if (moves.length === 0) {
    throw new Error('That line has no moves — an empty pattern would match every game.')
  }

  return { moves, positionKey: positionKey(chess.fen()), ply: moves.length }
}

/** Every position the game passed through, as position keys. Computed once per game. */
export function gamePositionKeys(moves: string[], limitPly: number = MAX_PATTERN_PLY): Set<string> {
  const chess = new Chess()
  const keys = new Set<string>()
  const end = Math.min(moves.length, limitPly)

  for (let i = 0; i < end; i++) {
    try {
      chess.move(moves[i])
    } catch {
      break // corrupt move list — keep whatever we replayed successfully
    }
    keys.add(positionKey(chess.fen()))
  }

  return keys
}

export function gameMatchesPattern(
  game: GameRecord,
  keys: Set<string>,
  pattern: PatternRecord,
): boolean {
  if (pattern.color !== 'any' && game.color !== pattern.color) return false
  return keys.has(pattern.positionKey)
}

/** ["e4","c6","d4"] -> "1. e4 c6 2. d4" */
export function formatMoves(moves: string[]): string {
  return moves
    .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san))
    .join(' ')
}

/* ------------------------------------------------------- variation tree */

export interface PatternNode {
  pattern: PatternRecord
  children: PatternNode[]
  depth: number
}

/** True when `parent` is a strict move-prefix of `child` — 1.e4 c6 is a parent of 1.e4 c6 2.d4 d5. */
export function isParentLine(parent: string[], child: string[]): boolean {
  if (parent.length >= child.length) return false
  return parent.every((san, index) => san === child[index])
}

const COLOR_SUFFIX: Record<PatternColor, string> = {
  any: '',
  white: ' (as White)',
  black: ' (as Black)',
}

/** "Caro-Kann (as Black)" — what tells two same-line repertoires apart on screen. */
export function patternLabel(pattern: PatternRecord): string {
  return pattern.name + COLOR_SUFFIX[pattern.color]
}

/**
 * Whether `parent` may adopt `child`. A line only joins a repertoire of the same
 * colour: the Panov Attack saved as White must not land under a Caro-Kann saved as
 * Black. A colour-agnostic parent takes anything, since its own totals already cover
 * both sides; the reverse would widen the parent past the colour it was saved with.
 */
export function canNest(
  parent: { color: PatternColor },
  child: { color: PatternColor },
): boolean {
  return parent.color === 'any' || parent.color === child.color
}

/**
 * Nests saved lines by move prefix: a line whose moves continue another saved line of
 * the same colour becomes its sub-variation, under the deepest such line. Transpositions
 * into a different opening are not considered here — only the literal move order.
 */
export function buildPatternTree(patterns: PatternRecord[]): PatternNode[] {
  const shortestFirst = [...patterns].sort(
    (a, b) => a.ply - b.ply || a.name.localeCompare(b.name),
  )
  const placed: PatternNode[] = []
  const roots: PatternNode[] = []

  for (const pattern of shortestFirst) {
    const node: PatternNode = { pattern, children: [], depth: 0 }

    let parent: PatternNode | null = null
    for (const candidate of placed) {
      if (!isParentLine(candidate.pattern.moves, pattern.moves)) continue
      if (!canNest(candidate.pattern, pattern)) continue

      if (!parent || candidate.pattern.ply > parent.pattern.ply) {
        parent = candidate
      } else if (
        candidate.pattern.ply === parent.pattern.ply &&
        candidate.pattern.color === pattern.color &&
        parent.pattern.color !== pattern.color
      ) {
        // same line saved both ways: the one matching this colour wins over the agnostic one
        parent = candidate
      }
    }

    if (parent) {
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }

    placed.push(node)
  }

  return roots
}

/** Depth-first order, which is what the dropdown and the list want. */
export function flattenTree(nodes: PatternNode[]): PatternNode[] {
  return nodes.flatMap(node => [node, ...flattenTree(node.children)])
}

/** A node's own line plus every sub-variation below it. */
export function subtreePatterns(node: PatternNode): PatternRecord[] {
  return [node.pattern, ...node.children.flatMap(subtreePatterns)]
}

/**
 * A game belongs to a variation when it reached that line or any of its
 * sub-variations — so a parent's totals always cover its children.
 */
export function gameMatchesNode(game: GameRecord, keys: Set<string>, node: PatternNode): boolean {
  return subtreePatterns(node).some(pattern => gameMatchesPattern(game, keys, pattern))
}

/**
 * The deepest chain of saved variations a game belongs to, e.g. Caro-Kann >
 * Exchange Variation > Panov Attack. Empty when the game matched nothing saved.
 * Siblings can both match a transposing game, so the longest chain wins.
 */
export function matchingPath(
  nodes: PatternNode[],
  game: GameRecord,
  keys: Set<string>,
): PatternNode[] {
  let best: PatternNode[] = []

  for (const node of nodes) {
    if (!gameMatchesNode(game, keys, node)) continue

    const candidate = [node, ...matchingPath(node.children, game, keys)]
    if (candidate.length > best.length) best = candidate
  }

  return best
}

/** The chain of variations from a root down to `id`, for breadcrumbs. */
export function findPath(nodes: PatternNode[], id: string): PatternNode[] {
  for (const node of nodes) {
    if (node.pattern.id === id) return [node]
    const below = findPath(node.children, id)
    if (below.length > 0) return [node, ...below]
  }
  return []
}
