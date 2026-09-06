import { Chess } from 'chess.js'
import type { GameRecord, PatternRecord } from '@/types/chess'

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
