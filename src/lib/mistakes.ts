/**
 * Every marked move in a slice, as rows you can filter and count.
 *
 * The dashboard answers "how did these games go". This answers the other question: what
 * actually went wrong, one move at a time, and where on the board it keeps happening.
 *
 * **Both new facts are read off the notation rather than by replaying the game.** A SAN
 * already carries the square the move landed on and the piece that moved — `Nxd4` is a
 * knight to d4 — and castling is the only case needing the colour to resolve. Replaying
 * every analysed game to learn the same two things took 1.9 seconds against 2
 * milliseconds for the parse, which is the difference between a page that can re-filter
 * as you type and one that cannot. Checked against a real replay on all 1485 marked
 * moves in the data: the square agreed on every one and so did the piece.
 */
import { isFault, markBadge } from './review'
import { SEVERITIES, settings } from './settings'
import { SEVERITY_MARK } from './bands'
import type { Color, GameRecord } from '@/types/chess'

/** The pieces a move can be, in the order a board is worth reading them in. */
export const PIECES = ['p', 'n', 'b', 'r', 'q', 'k'] as const
export type Piece = (typeof PIECES)[number]

export const PIECE_LABEL: Record<Piece, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
}

/** Solid figurines: one colour renders the same in every font, as the board learned. */
export const PIECE_FIGURINE: Record<Piece, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

/**
 * The square a move landed on, read straight off the notation.
 *
 * Everything but castling ends in its destination, including a capture (`exd5`), a check
 * (`Qh5+`) and a promotion (`d8=Q`). Castling names no square at all, so the colour says
 * which one the king reached. Null when the notation is something this cannot read, which
 * a caller drops rather than guessing at.
 */
export function landedOn(san: string, color: Color): string | null {
  const clean = san.replace(/[+#!?]+$/, '')
  if (clean.startsWith('O-O-O') || clean.startsWith('0-0-0')) return color === 'white' ? 'c1' : 'c8'
  if (clean.startsWith('O-O') || clean.startsWith('0-0')) return color === 'white' ? 'g1' : 'g8'

  const match = clean.replace(/=[QRBNqrbn]$/, '').match(/([a-h][1-8])$/)
  return match ? match[1] : null
}

/** Which piece moved. A SAN with no leading piece letter is a pawn move. */
export function pieceMoved(san: string): Piece {
  if (san.startsWith('O-O') || san.startsWith('0-0')) return 'k'
  const first = san[0]
  return ('NBRQK'.includes(first) ? first.toLowerCase() : 'p') as Piece
}

/**
 * The same square seen from your own side of the board.
 *
 * Only the rank is mirrored, never the file. As White your king starts on e1 and as Black
 * on e8, so mapping rank `r` to `9 - r` puts both on e1 and keeps every file meaning what
 * it meant — a kingside weakness stays on the kingside. Rotating the board 180° instead
 * would send e8 to d1 and quietly swap your king's file for your queen's.
 */
export function fromYourSide(square: string, color: Color): string {
  if (color === 'white') return square
  const rank = Number(square[1])
  return `${square[0]}${9 - rank}`
}

export interface MistakeRow {
  game: GameRecord
  ply: number
  moveNumber: number
  san: string
  /** `?`, `??`, or `?!` where the account shows inaccuracies. */
  tag: string
  cpBefore: number
  cpAfter: number
  /** The square it landed on, as played. */
  square: string
  piece: Piece
}

/**
 * Every marked move in these games, newest game first.
 *
 * "Marked" is whatever the account counts as a fault, which is `isFault` and therefore
 * the `marks` setting — so turning inaccuracies on fills this page as it fills the move
 * list. A move whose notation names no square is dropped rather than guessed at; none
 * exist in the data, and one would be a hand-edited document rather than a real game.
 */
export function mistakeRows(games: GameRecord[]): MistakeRow[] {
  const rows: MistakeRow[] = []

  for (const game of games) {
    for (const move of game.analysis?.moves ?? []) {
      if (!isFault(move.tag)) continue

      const square = landedOn(move.san, game.color)
      if (!square) continue

      rows.push({
        game,
        ply: move.ply,
        moveNumber: move.moveNumber,
        san: move.san,
        tag: move.tag,
        cpBefore: move.cpBefore,
        cpAfter: move.cpAfter,
        square,
        piece: pieceMoved(move.san),
      })
    }
  }

  return rows.sort((a, b) => b.game.playedAt - a.game.playedAt || a.ply - b.ply)
}

/** Which marks the account actually shows, worst first, for the filter row. */
export function activeMarks(config = settings()): string[] {
  return SEVERITIES.filter(severity => config.marks.includes(severity))
    .map(severity => SEVERITY_MARK[severity])
    .reverse()
}

export interface MistakeFilter {
  /** Marks to keep. Empty means every mark the account shows. */
  marks: string[]
  /** Pieces to keep. Empty means every piece. */
  pieces: Piece[]
}

export const NO_MISTAKE_FILTER: MistakeFilter = { marks: [], pieces: [] }

export function matchesMistake(row: MistakeRow, filter: MistakeFilter): boolean {
  if (filter.marks.length > 0 && !filter.marks.includes(row.tag)) return false
  if (filter.pieces.length > 0 && !filter.pieces.includes(row.piece)) return false
  return true
}

export interface HeatSquare {
  square: string
  count: number
  /** 0 to 1 against the worst square, which is what the shading is drawn from. */
  share: number
}

/**
 * How often a mistake landed on each square.
 *
 * `yourSide` mirrors a Black game's ranks onto White's, which is what makes the two
 * halves of your games comparable at all: without it a weakness you keep creating in
 * front of your own king is split across two boards and shows as nothing on either.
 * The raw view is still worth having — a square can matter in its own right — so it is
 * a switch rather than a decision.
 *
 * `share` is measured against the worst square rather than the total, because the
 * question is which squares stand out and a true share would make every one of
 * sixty-four a sliver. The same reasoning the think-time bars follow.
 */
export function heatmapOf(rows: MistakeRow[], yourSide: boolean): HeatSquare[] {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const square = yourSide ? fromYourSide(row.square, row.game.color) : row.square
    counts.set(square, (counts.get(square) ?? 0) + 1)
  }

  const worst = Math.max(0, ...counts.values())
  return [...counts.entries()].map(([square, count]) => ({
    square,
    count,
    share: worst === 0 ? 0 : count / worst,
  }))
}

/** The count on each square, keyed for a board to look up as it draws. */
export function heatBySquare(rows: MistakeRow[], yourSide: boolean): Map<string, HeatSquare> {
  return new Map(heatmapOf(rows, yourSide).map(entry => [entry.square, entry]))
}

/** How many of each mark are in a set of rows, for the chips to carry their counts. */
export function countBy<T extends string>(
  rows: MistakeRow[],
  of: (row: MistakeRow) => T,
): Map<T, number> {
  const counts = new Map<T, number>()
  for (const row of rows) {
    const key = of(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** The colour a mark is drawn in on this page, from the one severity scale. */
export function markTint(tag: string): string {
  return markBadge(tag)?.fill ?? '#a1a1aa'
}
