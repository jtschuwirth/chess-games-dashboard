import type { Color, GameResult, SyncedGame, TimeClass } from '@/types/chess'
import { ProviderError, USER_AGENT, movesFromPgn } from './shared'

/** Chess.com only exposes monthly archives, so we walk back at most this many months. */
const MAX_ARCHIVES = 24

/** Chess.com has no classical bucket — a selection of only `classical` yields nothing here. */
const TIME_CLASS_BY_SELECTION: Partial<Record<TimeClass, string>> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'daily',
}

const DRAW_RESULTS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
])

interface ChessComPlayer {
  username: string
  rating?: number
  result: string
}

interface ChessComGame {
  url: string
  pgn?: string
  time_control: string
  end_time: number
  uuid: string
  time_class: string
  rules: string
  white: ChessComPlayer
  black: ChessComPlayer
}

async function fetchJson<T>(url: string, notFoundMessage: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    cache: 'no-store',
  })

  if (response.status === 404) throw new ProviderError(notFoundMessage, 404)
  if (response.status === 429) {
    throw new ProviderError('Chess.com is rate limiting us — wait a minute and sync again.', 429)
  }
  if (!response.ok) {
    throw new ProviderError(`Chess.com returned ${response.status}.`)
  }

  return response.json() as Promise<T>
}

function resultFor(result: string): GameResult {
  if (result === 'win') return 'win'
  return DRAW_RESULTS.has(result) ? 'draw' : 'loss'
}

function headerValue(pgn: string, tag: string): string | null {
  const marker = `[${tag} "`
  const start = pgn.indexOf(marker)
  if (start === -1) return null

  const from = start + marker.length
  const end = pgn.indexOf('"', from)
  return end > from ? pgn.slice(from, end) : null
}

/** "https://www.chess.com/openings/Caro-Kann-Defense-Tartakower" -> "Caro Kann Defense Tartakower" */
function openingFromEcoUrl(pgn: string): string | null {
  const url = headerValue(pgn, 'ECOUrl')
  if (!url) return null
  const slug = url.split('/').pop()
  return slug ? decodeURIComponent(slug).replace(/-/g, ' ') : null
}

function normalize(game: ChessComGame, username: string): SyncedGame | null {
  const lower = username.toLowerCase()
  const color: Color | null =
    game.white.username.toLowerCase() === lower
      ? 'white'
      : game.black.username.toLowerCase() === lower
        ? 'black'
        : null

  if (!color) return null

  const me = color === 'white' ? game.white : game.black
  const opponent = color === 'white' ? game.black : game.white
  const pgn = game.pgn ?? ''

  return {
    source: 'chesscom',
    sourceId: game.uuid,
    url: game.url,
    playedAt: game.end_time * 1000,
    timeClass: game.time_class as TimeClass,
    timeControl: game.time_control,
    color,
    result: resultFor(me.result),
    termination: me.result === 'win' ? opponent.result : me.result,
    opponent: opponent.username,
    opponentRating: opponent.rating ?? null,
    userRating: me.rating ?? null,
    eco: headerValue(pgn, 'ECO'),
    openingName: openingFromEcoUrl(pgn),
    moves: movesFromPgn(pgn),
  }
}

export async function fetchChessComGames(
  username: string,
  max: number,
  timeClasses: TimeClass[],
): Promise<{ games: SyncedGame[]; warnings: string[] }> {
  const warnings: string[] = []
  const wanted = new Set(
    timeClasses.map(tc => TIME_CLASS_BY_SELECTION[tc]).filter((tc): tc is string => Boolean(tc)),
  )

  if (wanted.size === 0) {
    warnings.push('Chess.com has no classical time class — nothing to fetch there.')
    return { games: [], warnings }
  }

  const { archives } = await fetchJson<{ archives: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
    `No Chess.com player named "${username}".`,
  )

  const newestFirst = [...archives].reverse().slice(0, MAX_ARCHIVES)
  const games: SyncedGame[] = []

  for (const archiveUrl of newestFirst) {
    if (games.length >= max) break

    const month = await fetchJson<{ games: ChessComGame[] }>(archiveUrl, 'Archive not found.')

    for (const game of [...(month.games ?? [])].reverse()) {
      if (games.length >= max) break
      if (game.rules !== 'chess') continue
      if (!wanted.has(game.time_class)) continue

      const normalized = normalize(game, username)
      if (normalized) games.push(normalized)
    }
  }

  if (games.length < max && newestFirst.length === MAX_ARCHIVES) {
    warnings.push(`Chess.com: only searched the last ${MAX_ARCHIVES} months of archives.`)
  }

  return { games, warnings }
}
