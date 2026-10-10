import { Chess } from 'chess.js'
import { normalizeStudy } from './study'
import type { GameRecord, OpeningColor, OpeningLine } from '@/types/chess'

/**
 * How deep into a game we look for the opening position. Openings transpose long
 * before move 30, and this bounds the replay cost when a few hundred games load.
 */
export const MAX_OPENING_PLY = 60

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

export interface ParsedOpening {
  moves: string[]
  positionKey: string
  ply: number
}

/** Turns a pasted line like "1. e4 c6 2. d4 d5" into moves + the position it reaches. */
export function parseOpening(pgn: string): ParsedOpening {
  const chess = new Chess()

  try {
    chess.loadPgn(pgn.trim())
  } catch {
    throw new Error('Invalid PGN — check the move notation and try again.')
  }

  const moves = chess.history()
  if (moves.length === 0) {
    throw new Error('That line has no moves — an empty opening would match every game.')
  }

  return { moves, positionKey: positionKey(chess.fen()), ply: moves.length }
}

/** Every position the game passed through, as position keys. Computed once per game. */
export function gamePositionKeys(moves: string[], limitPly: number = MAX_OPENING_PLY): Set<string> {
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

export function gameMatchesOpening(
  game: GameRecord,
  keys: Set<string>,
  opening: OpeningLine,
): boolean {
  if (opening.color !== 'any' && game.color !== opening.color) return false
  return keys.has(opening.positionKey)
}

/** ["e4","c6","d4"] -> "1. e4 c6 2. d4" */
export function formatMoves(moves: string[]): string {
  return moves
    .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san))
    .join(' ')
}

/* ------------------------------------------------------- variation tree */

export interface OpeningNode {
  opening: OpeningLine
  children: OpeningNode[]
  depth: number
}

/** True when `parent` is a strict move-prefix of `child` — 1.e4 c6 is a parent of 1.e4 c6 2.d4 d5. */
export function isParentLine(parent: string[], child: string[]): boolean {
  if (parent.length >= child.length) return false
  return parent.every((san, index) => san === child[index])
}

const COLOR_SUFFIX: Record<OpeningColor, string> = {
  any: '',
  white: ' (as White)',
  black: ' (as Black)',
}

/** "Caro-Kann (as Black)" — what tells two same-line repertoires apart on screen. */
export function openingLabel(opening: OpeningLine): string {
  return opening.name + COLOR_SUFFIX[opening.color]
}

/**
 * Whether `parent` may adopt `child`. A line only joins a repertoire of the same
 * colour: the Panov Attack saved as White must not land under a Caro-Kann saved as
 * Black. A colour-agnostic parent takes anything, since its own totals already cover
 * both sides; the reverse would widen the parent past the colour it was saved with.
 */
export function canNest(
  parent: { color: OpeningColor },
  child: { color: OpeningColor },
): boolean {
  return parent.color === 'any' || parent.color === child.color
}

/**
 * Nests saved lines by move prefix: a line whose moves continue another saved line of
 * the same colour becomes its sub-variation, under the deepest such line. Transpositions
 * into a different opening are not considered here — only the literal move order.
 */
export function buildOpeningTree(openings: OpeningLine[]): OpeningNode[] {
  const shortestFirst = [...openings].sort(
    (a, b) => a.ply - b.ply || a.name.localeCompare(b.name),
  )
  const placed: OpeningNode[] = []
  const roots: OpeningNode[] = []

  for (const opening of shortestFirst) {
    const node: OpeningNode = { opening, children: [], depth: 0 }

    let parent: OpeningNode | null = null
    for (const candidate of placed) {
      if (!isParentLine(candidate.opening.moves, opening.moves)) continue
      if (!canNest(candidate.opening, opening)) continue

      if (!parent || candidate.opening.ply > parent.opening.ply) {
        parent = candidate
      } else if (
        candidate.opening.ply === parent.opening.ply &&
        candidate.opening.color === opening.color &&
        parent.opening.color !== opening.color
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
export function flattenTree(nodes: OpeningNode[]): OpeningNode[] {
  return nodes.flatMap(node => [node, ...flattenTree(node.children)])
}

/** A node's own line plus every sub-variation below it. */
export function subtreeOpenings(node: OpeningNode): OpeningLine[] {
  return [node.opening, ...node.children.flatMap(subtreeOpenings)]
}

/**
 * A game belongs to a variation when it reached that line or any of its
 * sub-variations — so a parent's totals always cover its children.
 */
export function gameMatchesNode(game: GameRecord, keys: Set<string>, node: OpeningNode): boolean {
  return subtreeOpenings(node).some(opening => gameMatchesOpening(game, keys, opening))
}

/**
 * The deepest chain of saved variations a game belongs to, e.g. Caro-Kann >
 * Exchange Variation > Panov Attack. Empty when the game matched nothing saved.
 * Siblings can both match a transposing game, so the longest chain wins.
 */
export function matchingPath(
  nodes: OpeningNode[],
  game: GameRecord,
  keys: Set<string>,
): OpeningNode[] {
  let best: OpeningNode[] = []

  for (const node of nodes) {
    if (!gameMatchesNode(game, keys, node)) continue

    const candidate = [node, ...matchingPath(node.children, game, keys)]
    if (candidate.length > best.length) best = candidate
  }

  return best
}

/** The chain of variations from a root down to `id`, for breadcrumbs. */
export function findPath(nodes: OpeningNode[], id: string): OpeningNode[] {
  for (const node of nodes) {
    if (node.opening.id === id) return [node]
    const below = findPath(node.children, id)
    if (below.length > 0) return [node, ...below]
  }
  return []
}

/**
 * A stored line in the shape the code expects, whatever shape it was written in.
 *
 * Openings were the one collection without a normaliser — the read was a bare cast,
 * which was fine while the type was six required fields and stopped being fine when a
 * study was written on them. Same habit as `normalizePattern` and `normalizePlan`:
 * converted on read rather than migrated, so the 65 lines saved before any of this
 * existed need nothing done to them.
 */
export function normalizeOpening(raw: OpeningLine): OpeningLine {
  return { ...raw, study: normalizeStudy(raw.study) }
}
