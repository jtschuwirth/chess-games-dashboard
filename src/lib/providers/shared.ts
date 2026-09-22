import { Chess } from 'chess.js'
import { TIME_CLASSES, type TimeClass } from '@/types/chess'

export const USER_AGENT =
  'chess-games-dashboard/0.1 (+https://github.com/jtschuwirth/chess-games-dashboard)'

export const MAX_GAMES = 1000

/** An error whose message is safe to show the user, with the status to return. */
export class ProviderError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

export function parseMax(raw: string | null): number {
  const value = Number(raw ?? 50)
  if (!Number.isFinite(value) || value < 1) {
    throw new ProviderError('`max` must be a positive number.', 400)
  }
  return Math.min(Math.floor(value), MAX_GAMES)
}

export function parseUsername(raw: string | null): string {
  const username = (raw ?? '').trim()
  if (!/^[\w-]{1,40}$/.test(username)) {
    throw new ProviderError('Provide a valid username.', 400)
  }
  return username
}

export function parseList(raw: string | null): string[] {
  return (raw ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

/** SAN move list from a PGN. Returns [] rather than throwing so one odd game can't fail a sync. */
export function movesFromPgn(pgn: string): string[] {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn.trim())
  } catch {
    return []
  }
  return chess.history()
}

const CLOCK_COMMENT = /\{\[%clk\s+([0-9]+):([0-9]{2}):([0-9]{2}(?:\.[0-9]+)?)\]\}/g

/**
 * Seconds left after each ply, read from the `{[%clk h:mm:ss]}` comments chess.com puts
 * on every move. They appear in move order, so the nth match belongs to the nth ply.
 * Returns null when the PGN carries none, which is the case for daily games.
 */
export function clocksFromPgn(pgn: string): number[] | null {
  const seconds: number[] = []

  for (const match of pgn.matchAll(CLOCK_COMMENT)) {
    seconds.push(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]))
  }

  return seconds.length > 0 ? seconds : null
}

export interface SyncParams {
  username: string
  max: number
  timeClasses: TimeClass[]
}

/** Shared query-string contract for both provider routes. */
export function parseSyncParams(url: string): SyncParams {
  const params = new URL(url).searchParams
  const timeClasses = parseList(params.get('timeClasses')).filter((value): value is TimeClass =>
    (TIME_CLASSES as string[]).includes(value),
  )

  if (timeClasses.length === 0) {
    throw new ProviderError('Select at least one time class.', 400)
  }

  return {
    username: parseUsername(params.get('username')),
    max: parseMax(params.get('max')),
    timeClasses,
  }
}
