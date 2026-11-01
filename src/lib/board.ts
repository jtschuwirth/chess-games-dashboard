import { Chess } from 'chess.js'

/** One half-move, with the position on either side of it. */
export interface Ply {
  /** Index into the game's move list. */
  index: number
  san: string
  from: string
  to: string
  /** Whose move it was. */
  color: 'white' | 'black'
  /** Your own move number — the count the phase ranges use. */
  moveNumber: number
  /** The position the move was played in. */
  fenBefore: string
  fenAfter: string
}

export interface Replay {
  /** `fens[i]` is the position before ply `i`; the last entry is the final position. */
  fens: string[]
  plies: Ply[]
  /** True when the stored move list stopped parsing part way through. */
  truncated: boolean
}

/**
 * Replays a stored move list once, keeping every position. The game view steps
 * through this rather than re-running chess.js on each click.
 */
export function replayGame(moves: string[]): Replay {
  const chess = new Chess()
  const fens: string[] = [chess.fen()]
  const plies: Ply[] = []
  let truncated = false

  for (let index = 0; index < moves.length; index++) {
    const fenBefore = chess.fen()

    let move
    try {
      move = chess.move(moves[index])
    } catch {
      truncated = true
      break
    }

    const fenAfter = chess.fen()
    fens.push(fenAfter)
    plies.push({
      index,
      san: move.san,
      from: move.from,
      to: move.to,
      color: move.color === 'w' ? 'white' : 'black',
      moveNumber: Math.floor(index / 2) + 1,
      fenBefore,
      fenAfter,
    })
  }

  return { fens, plies, truncated }
}

export interface BoardSquare {
  /** Algebraic name, e.g. "e4". */
  name: string
  piece: { type: string; color: 'white' | 'black' } | null
  /** Light squares are the ones a1-coloured dark, counted from a8. */
  light: boolean
}

/**
 * Eight ranks of eight squares, oriented for the side given. Black's view is the
 * same array reversed, which is what a board flip is.
 */
export function squaresFrom(fen: string, orientation: 'white' | 'black'): BoardSquare[][] {
  const rows = new Chess(fen).board().map((row, rankIndex) =>
    row.map((cell, fileIndex) => ({
      name: 'abcdefgh'[fileIndex] + (8 - rankIndex),
      piece: cell ? { type: cell.type, color: cell.color === 'w' ? 'white' : 'black' } : null,
      light: (rankIndex + fileIndex) % 2 === 0,
    })),
  ) as BoardSquare[][]

  if (orientation === 'white') return rows
  return rows.map(row => [...row].reverse()).reverse()
}

/** Where a piece on one square may go, and what it would do there. */
export interface Destination {
  to: string
  /** There is something of theirs on it — drawn as a ring rather than a dot. */
  capture: boolean
  /** Landing here means choosing a piece. */
  promotion: boolean
}

/**
 * Every legal move for the piece on a square. What a board needs to show where a
 * selected piece can go, and to refuse a drop that is not a move.
 *
 * chess.js is the only authority on legality here as everywhere else; this just asks
 * it the question in the shape a board wants the answer in. An unreadable FEN gives
 * no moves rather than throwing, since a board is often mid-edit.
 */
export function legalMovesFrom(fen: string, square: string): Destination[] {
  try {
    const moves = new Chess(fen).moves({ square: square as never, verbose: true })
    const byTarget = new Map<string, Destination>()

    for (const move of moves) {
      // the four promotion choices are four moves to one square; the board asks once
      const existing = byTarget.get(move.to)
      if (existing) {
        existing.promotion = existing.promotion || Boolean(move.promotion)
        continue
      }

      byTarget.set(move.to, {
        to: move.to,
        capture: move.captured !== undefined,
        promotion: Boolean(move.promotion),
      })
    }

    return [...byTarget.values()]
  } catch {
    return []
  }
}

/** Whose turn it is. A board only lets you pick up a piece of the side to move. */
export function sideToMove(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

/**
 * Whose move it is, written out.
 *
 * One phrase rather than two, because a position handed to you out of its game — a
 * coach's exercise, a boundary in the pattern drill — is unreadable without it and the
 * two screens showing it must not word it differently. The board is already turned to
 * that side in both; this is the part you can read.
 */
export function playLabel(color: 'white' | 'black'): string {
  return color === 'white' ? 'White to play' : 'Black to play'
}

export interface PlayedMove {
  san: string
  /** The position the move leads to — what an engine needs to judge it. */
  fen: string
  /** The squares it went between, for a board to wash. */
  from: string
  to: string
}

/**
 * Plays a typed move if it is legal in this position. Typing "Ka7" or "ka7" or "K a7"
 * should all be accepted, so the input is tidied first and then handed to chess.js,
 * which is the only authority on legality.
 */
export function playMove(fen: string, input: string): PlayedMove | null {
  const text = input.trim().replace(/\s+/g, '').replace(/^\d+\.+/, '')
  if (text.length === 0) return null

  for (const candidate of [text, text[0].toUpperCase() + text.slice(1)]) {
    try {
      const chess = new Chess(fen)
      const move = chess.move(candidate)
      return { san: move.san, fen: chess.fen(), from: move.from, to: move.to }
    } catch {
      // try the next spelling
    }
  }

  return null
}

/** The SAN for a legal move, otherwise null. */
export function normalizeSan(fen: string, input: string): string | null {
  return playMove(fen, input)?.san ?? null
}

/** The engine speaks UCI ("e2e4"); the move list speaks SAN. */
export function sanFromUci(fen: string, uci: string): string | null {
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci.slice(4, 5)

  try {
    return new Chess(fen).move({ from, to, ...(promotion ? { promotion } : {}) }).san
  } catch {
    return null
  }
}

/**
 * How long a proposed line may run: ten moves each. Past that you are not recording
 * what you would have played, you are writing out an engine line.
 */
export const MAX_LINE_PLIES = 20

export interface PlayedLine {
  /** The legal moves, in SAN, in order. */
  line: string[]
  /** `fens[i]` is the position after `line[i]`. */
  fens: string[]
  /** Where each move came from and went, for highlighting it on a board. */
  squares: { from: string; to: string }[]
  /** The first token that was not a legal move here, if any. */
  invalid: string | null
  /** True when the input ran past `MAX_LINE_PLIES`. */
  tooLong: boolean
}

/** Plays a sequence of SAN moves from a position, stopping at the first illegal one. */
export function playLine(
  fen: string,
  moves: string[],
  maxPlies: number = MAX_LINE_PLIES,
): PlayedLine {
  const chess = new Chess(fen)
  const line: string[] = []
  const fens: string[] = []
  const squares: { from: string; to: string }[] = []

  for (const move of moves) {
    if (line.length >= maxPlies) return { line, fens, squares, invalid: null, tooLong: true }

    let played
    for (const candidate of [move, move[0].toUpperCase() + move.slice(1)]) {
      try {
        played = chess.move(candidate)
        break
      } catch {
        // try the next spelling
      }
    }

    if (!played) return { line, fens, squares, invalid: move, tooLong: false }
    line.push(played.san)
    fens.push(chess.fen())
    squares.push({ from: played.from, to: played.to })
  }

  return { line, fens, squares, invalid: null, tooLong: false }
}

/**
 * Parses a typed line — "Nd5 Bxe7 Qxe7", or pasted with move numbers — and plays it.
 * Move numbers are dropped rather than checked: the line starts from the position in
 * front of you, so whatever numbering was pasted in is not necessarily this game's.
 */
export function parseLine(
  fen: string,
  input: string,
  maxPlies: number = MAX_LINE_PLIES,
): PlayedLine {
  const tokens = input
    .split(/[\s,]+/)
    .map(part => part.trim().replace(/^\d+\.+/, ''))
    .filter(part => part.length > 0 && !/^\d+\.*$/.test(part))

  return playLine(fen, tokens, maxPlies)
}

/**
 * A line split into its moves, each with the numbering that belongs in front of it, so
 * a move list can make every move of a variation separately clickable.
 */
export function lineTokens(
  startPly: number,
  moves: string[],
): { san: string; prefix: string }[] {
  return moves.map((san, offset) => {
    const ply = startPly + offset
    const number = Math.floor(ply / 2) + 1

    if (ply % 2 === 0) return { san, prefix: `${number}.` }
    // only a line that opens on black's move needs the ellipsis
    return { san, prefix: offset === 0 ? `${number}...` : '' }
  })
}

/** "14... h6 15. Bxh6 gxh6" — a line written from the ply it branches at. */
export function formatLine(startPly: number, moves: string[]): string {
  return lineTokens(startPly, moves)
    .map(token => (token.prefix ? `${token.prefix} ${token.san}` : token.san))
    .join(' ')
}

/** "e4" -> "1. e4", "c6" -> "1... c6", by ply index. */
export function plyLabel(index: number, san: string): string {
  const number = Math.floor(index / 2) + 1
  return index % 2 === 0 ? `${number}. ${san}` : `${number}... ${san}`
}
