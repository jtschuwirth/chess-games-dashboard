import type { Color, SyncedGame, TimeClass } from '@/types/chess'
import { alignClocks } from '@/lib/clocks'
import { ProviderError, USER_AGENT } from './shared'

/** Our time classes mapped onto Lichess perf types. */
const PERF_TYPES_BY_SELECTION: Record<TimeClass, string[]> = {
  bullet: ['ultraBullet', 'bullet'],
  blitz: ['blitz'],
  rapid: ['rapid'],
  classical: ['classical'],
  daily: ['correspondence'],
}

const TIME_CLASS_BY_SPEED: Record<string, TimeClass> = {
  ultraBullet: 'bullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
}

interface LichessPlayer {
  user?: { name: string; id: string }
  /** The rating the player took INTO the game. */
  rating?: number
  /** What the game did to it. Absent on unrated games. */
  ratingDiff?: number
  aiLevel?: number
}

/**
 * The rating a player came out of the game with.
 *
 * Lichess reports the rating going in and the change separately, so what it calls
 * `rating` is the figure before the result — the opposite of chess.com, whose archive
 * already carries the rating after. Storing the raw field meant a lichess rating was
 * always one game behind: a win you had just played never showed, and a week's figure
 * could fall after a win because it was reading the rating before the game that followed
 * the loss before it. Everything downstream assumes post-game, so the addition happens
 * here, once, rather than every reader having to know which provider it came from.
 */
function ratingAfter(player: LichessPlayer): number | null {
  if (player.rating === undefined) return null
  return player.rating + (player.ratingDiff ?? 0)
}

interface LichessGame {
  id: string
  variant: string
  speed: string
  status: string
  createdAt: number
  winner?: 'white' | 'black'
  clock?: { initial: number; increment: number }
  daysPerTurn?: number
  opening?: { eco: string; name: string; ply: number }
  moves?: string
  /** Centiseconds left after each ply. */
  clocks?: number[]
  players: { white: LichessPlayer; black: LichessPlayer }
}

function timeControlOf(game: LichessGame): string {
  if (game.clock) return `${game.clock.initial}+${game.clock.increment}`
  if (game.daysPerTurn) return `${game.daysPerTurn} days`
  return 'unlimited'
}

function playerName(player: LichessPlayer): string {
  if (player.user) return player.user.name
  return player.aiLevel ? `Stockfish level ${player.aiLevel}` : 'Anonymous'
}

function normalize(game: LichessGame, username: string): SyncedGame | null {
  const lower = username.toLowerCase()
  const color: Color | null =
    game.players.white.user?.id === lower
      ? 'white'
      : game.players.black.user?.id === lower
        ? 'black'
        : null

  if (!color) return null

  const me = game.players[color]
  const opponent = game.players[color === 'white' ? 'black' : 'white']
  const moves = game.moves ? game.moves.split(' ').filter(Boolean) : []

  return {
    source: 'lichess',
    sourceId: game.id,
    url: `https://lichess.org/${game.id}`,
    playedAt: game.createdAt,
    timeClass: TIME_CLASS_BY_SPEED[game.speed] ?? 'blitz',
    timeControl: timeControlOf(game),
    color,
    result: !game.winner ? 'draw' : game.winner === color ? 'win' : 'loss',
    termination: game.status,
    opponent: playerName(opponent),
    // lichess flags engine opponents with an aiLevel and gives them no account
    opponentIsBot: opponent.aiLevel !== undefined,
    opponentRating: ratingAfter(opponent),
    userRating: ratingAfter(me),
    eco: game.opening?.eco ?? null,
    openingName: game.opening?.name ?? null,
    moves,
    clocks: game.clocks
      ? alignClocks(
          game.clocks.map(centiseconds => centiseconds / 100),
          moves.length,
        )
      : null,
  }
}

export async function fetchLichessGames(
  username: string,
  max: number,
  timeClasses: TimeClass[],
): Promise<{ games: SyncedGame[]; warnings: string[] }> {
  const warnings: string[] = []
  const perfTypes = timeClasses.flatMap(tc => PERF_TYPES_BY_SELECTION[tc] ?? [])

  if (perfTypes.length === 0) return { games: [], warnings }

  const params = new URLSearchParams({
    max: String(max),
    perfType: perfTypes.join(','),
    moves: 'true',
    opening: 'true',
    clocks: 'true',
    evals: 'false',
    tags: 'false',
  })

  const response = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`,
    {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/x-ndjson' },
      cache: 'no-store',
    },
  )

  if (response.status === 404) throw new ProviderError(`No Lichess player named "${username}".`, 404)
  if (response.status === 429) {
    throw new ProviderError('Lichess is rate limiting us — wait a minute and sync again.', 429)
  }
  if (!response.ok) throw new ProviderError(`Lichess returned ${response.status}.`)

  const games: SyncedGame[] = []
  let skippedVariants = 0

  for (const line of (await response.text()).split('\n')) {
    if (!line.trim()) continue

    const game = JSON.parse(line) as LichessGame
    if (game.variant !== 'standard') {
      skippedVariants++
      continue
    }

    const normalized = normalize(game, username)
    if (normalized) games.push(normalized)
  }

  if (skippedVariants > 0) {
    warnings.push(`Lichess: skipped ${skippedVariants} variant game(s).`)
  }

  return { games, warnings }
}
