import { Chess } from 'chess.js'
import { clocksFromPgn, movesFromPgn } from './providers/shared'
import { timeControlKey } from './clocks'
import type { Color, GameResult, SyncedGame, TimeClass } from '@/types/chess'

/**
 * Games you brought in yourself: an over-the-board game, a friend's, one from a book.
 * They go through the same shape as a synced game so the board, the engine, the review,
 * the drill and the patterns all work on them without knowing where they came from.
 */

/** Which side of the uploaded game is you. */
export type UploadSide = Color | 'detect'

export interface UploadOptions {
  side: UploadSide
  /** Your linked usernames, for `detect` — matched against the White and Black headers. */
  usernames: string[]
}

export interface UploadResult {
  games: SyncedGame[]
  /** Anything that was odd but not fatal, named per game so it can be acted on. */
  warnings: string[]
}

/**
 * Splits a file holding several games. A PGN collection separates games by starting a
 * fresh header block, so a line beginning `[Event` after some moves is the next game.
 * Text before the first one is ignored rather than guessed at.
 */
export function splitPgnGames(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const games: string[] = []
  let current: string[] = []
  let sawMoves = false

  for (const line of lines) {
    const isHeader = line.startsWith('[')

    if (isHeader && sawMoves && current.length > 0) {
      games.push(current.join('\n'))
      current = []
      sawMoves = false
    }

    if (!isHeader && line.trim().length > 0) sawMoves = true
    current.push(line)
  }

  if (current.join('').trim().length > 0) games.push(current.join('\n'))
  return games.filter(game => game.trim().length > 0)
}

/**
 * FNV-1a over the thing that identifies a game — its moves and who played them. Two
 * pastes of the same game land on the same document id, so re-uploading updates rather
 * than duplicates, and `saveGames` merges, so a review written on it survives.
 */
function fingerprint(parts: string[]): string {
  let hash = 0x811c9dc5
  const text = parts.join('|')

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

/** PGN dates are `2026.10.04`, sometimes with `??` where a part is unknown. */
function parsePgnDate(date: string | undefined, time: string | undefined): number {
  const [year, month, day] = (date ?? '').split('.').map(part => Number(part))
  if (!Number.isFinite(year) || year < 1500) return Date.now()

  const [hour, minute, second] = (time ?? '').split(':').map(part => Number(part))
  return Date.UTC(
    year,
    Number.isFinite(month) ? month - 1 : 0,
    Number.isFinite(day) ? day : 1,
    Number.isFinite(hour) ? hour : 12,
    Number.isFinite(minute) ? minute : 0,
    Number.isFinite(second) ? second : 0,
  )
}

/**
 * The class a clock belongs to, by its base time, using the thresholds both providers
 * use. Only a rough bucket — the analysis filters by the control itself, because 10+0
 * and 15+10 are both "rapid" and behave nothing alike.
 */
function timeClassOf(control: string): TimeClass {
  const base = Number(control.split('+')[0])
  if (!Number.isFinite(base) || base <= 0) return 'classical'
  if (base < 180) return 'bullet'
  if (base < 600) return 'blitz'
  if (base < 1800) return 'rapid'
  return 'classical'
}

function resultFor(raw: string | undefined, color: Color): GameResult | null {
  if (raw === '1/2-1/2') return 'draw'
  if (raw === '1-0') return color === 'white' ? 'win' : 'loss'
  if (raw === '0-1') return color === 'black' ? 'win' : 'loss'
  return null
}

/** Which side you are: what you asked for, or whichever name matches one of yours. */
function sideOf(side: UploadSide, usernames: string[], white: string, black: string): Color {
  if (side !== 'detect') return side

  const mine = usernames.map(name => name.trim().toLowerCase()).filter(name => name.length > 0)
  if (mine.includes(black.trim().toLowerCase())) return 'black'
  return 'white'
}

function headersOf(pgn: string): Record<string, string> {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn.trim())
  } catch {
    return {}
  }

  // chess.js has moved this between versions; both shapes are plain string maps.
  const raw = (chess as unknown as { header?: () => Record<string, string>; getHeaders?: () => Record<string, string> })
  return (raw.getHeaders?.() ?? raw.header?.() ?? {}) as Record<string, string>
}

/**
 * One pasted game. Returns null when there are no moves to read — an empty or unreadable
 * PGN is reported rather than stored, since a game with no moves is nothing to study.
 */
export function parseUpload(
  pgn: string,
  options: UploadOptions,
  index: number,
): { game: SyncedGame | null; warning: string | null } {
  const moves = movesFromPgn(pgn)
  const label = `Game ${index + 1}`

  if (moves.length === 0) {
    return { game: null, warning: `${label}: no moves could be read — skipped.` }
  }

  const headers = headersOf(pgn)
  const white = headers.White ?? 'White'
  const black = headers.Black ?? 'Black'
  const color = sideOf(options.side, options.usernames, white, black)

  const resolved = resultFor(headers.Result, color)
  // Canonical when it parses, empty when it does not: an unreadable clock should show
  // nothing rather than a control that no other game can be compared against.
  const control = timeControlKey((headers.TimeControl ?? '').trim()) ?? ''

  const whiteElo = Number(headers.WhiteElo)
  const blackElo = Number(headers.BlackElo)
  const mineElo = color === 'white' ? whiteElo : blackElo
  const theirsElo = color === 'white' ? blackElo : whiteElo

  const game: SyncedGame = {
    source: 'upload',
    sourceId: fingerprint([moves.join(' '), white, black, headers.Date ?? '']),
    url: headers.Link ?? headers.Site ?? '',
    playedAt: parsePgnDate(headers.Date ?? headers.UTCDate, headers.UTCTime ?? headers.Time),
    timeClass: timeClassOf(control),
    timeControl: control,
    color,
    result: resolved ?? 'draw',
    termination: headers.Termination ?? 'unknown',
    opponent: color === 'white' ? black : white,
    opponentIsBot: false,
    opponentRating: Number.isFinite(theirsElo) ? theirsElo : null,
    userRating: Number.isFinite(mineElo) ? mineElo : null,
    eco: headers.ECO ?? null,
    openingName: headers.Opening ?? null,
    moves,
    clocks: clocksFromPgn(pgn),
  }

  return {
    game,
    warning:
      resolved === null
        ? `${label}: no finished result in the PGN — stored as a draw, which only affects how it reads.`
        : null,
  }
}

/** A whole paste, which may hold one game or a file of them. */
export function parseUploads(text: string, options: UploadOptions): UploadResult {
  const games: SyncedGame[] = []
  const warnings: string[] = []

  splitPgnGames(text).forEach((pgn, index) => {
    const { game, warning } = parseUpload(pgn, options, index)
    if (game) games.push(game)
    if (warning) warnings.push(warning)
  })

  if (games.length === 0 && warnings.length === 0) {
    warnings.push('Nothing to read — paste a PGN first.')
  }

  return { games, warnings }
}
