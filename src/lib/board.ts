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

/**
 * The SAN for a move if it is legal in this position, otherwise null. Typing "Ka7"
 * or "ka7" or "K a7" should all be accepted, so the input is tidied first and then
 * handed to chess.js, which is the only authority on legality.
 */
export function normalizeSan(fen: string, input: string): string | null {
  const text = input.trim().replace(/\s+/g, '').replace(/^\d+\.+/, '')
  if (text.length === 0) return null

  for (const candidate of [text, text[0].toUpperCase() + text.slice(1)]) {
    try {
      return new Chess(fen).move(candidate).san
    } catch {
      // try the next spelling
    }
  }

  return null
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

export interface ProposedMove {
  /** What you typed. */
  input: string
  /** Its SAN if the move is legal here, otherwise null. */
  san: string | null
}

/** Parses the "better moves" field — moves separated by commas or spaces. */
export function parseProposedMoves(fen: string, raw: string): ProposedMove[] {
  return raw
    .split(/[,\s]+/)
    .map(part => part.trim())
    .filter(part => part.length > 0 && !/^\d+\.+$/.test(part))
    .map(input => ({ input, san: normalizeSan(fen, input) }))
}

/** "e4" -> "1. e4", "c6" -> "1... c6", by ply index. */
export function plyLabel(index: number, san: string): string {
  const number = Math.floor(index / 2) + 1
  return index % 2 === 0 ? `${number}. ${san}` : `${number}... ${san}`
}
