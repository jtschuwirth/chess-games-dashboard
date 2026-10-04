import { ENGINE_DEPTH } from './analysis'
import { alignClocks, parseTimeControl, timeSpentPerPly } from './clocks'
import { isFault } from './review'
import type { GameRecord, GameResult } from '@/types/chess'

/**
 * Two readings over games the engine has already been through: how much you give away
 * per move, and whether it depends on how long you thought.
 *
 * Both only count games analysed at `ENGINE_DEPTH`. A shallower engine finds fewer
 * mistakes and scores them smaller, so mixing depths would show you improving at the
 * moment the depth changed — which is exactly what happened here when it settled at 21
 * and older games kept their 12. One depth or the number means nothing.
 */
export function isComparable(game: GameRecord): boolean {
  return game.analysis?.depth === ENGINE_DEPTH
}

/** How many games in a slice the engine has looked at closely enough to count. */
export function comparableGames(games: GameRecord[]): GameRecord[] {
  return games.filter(isComparable)
}

export interface GameAccuracy {
  gameId: string
  playedAt: number
  result: GameResult
  /** Average centipawns given away per move of yours. */
  acpl: number
  moves: number
}

/**
 * Average centipawn loss for one game. Null when the game is not comparable.
 *
 * Losses are clamped at zero: a move can come back with a negative `cpLoss` when the
 * engine likes the position more after it than before, and counting that as credit would
 * let one lucky move pay for a blunder.
 */
export function gameAccuracy(game: GameRecord): GameAccuracy | null {
  if (!isComparable(game)) return null

  const moves = game.analysis?.moves ?? []
  if (moves.length === 0) return null

  const total = moves.reduce((sum, move) => sum + Math.max(0, move.cpLoss), 0)

  return {
    gameId: game.id,
    playedAt: game.playedAt,
    result: game.result,
    acpl: total / moves.length,
    moves: moves.length,
  }
}

export interface AccuracyTrend {
  /** Oldest first, which is the direction a chart is read in. */
  points: GameAccuracy[]
  /** Mean over the most recent window, and over the window before it. */
  recent: number | null
  previous: number | null
  /** Games per window — smaller than `WINDOW` when there are not enough games yet. */
  window: number
}

/** The most games either window holds. */
export const TREND_WINDOW = 10

/**
 * The fewest. Below this there is no comparison at all, rather than a smaller one: two
 * windows of one game each would happily report "higher than the run before it" about a
 * single bad evening, which is worse than saying nothing.
 */
export const MIN_TREND_WINDOW = 5

/**
 * Per-game accuracy oldest first, with the last `TREND_WINDOW` games against the
 * `TREND_WINDOW` before them. Two windows rather than a line of best fit because the
 * question is "has anything changed lately", and a trend line over a year of games
 * answers a slower question than the one being asked.
 */
export function accuracyTrend(games: GameRecord[]): AccuracyTrend {
  const points = games
    .map(gameAccuracy)
    .filter((entry): entry is GameAccuracy => entry !== null)
    .sort((a, b) => a.playedAt - b.playedAt)

  const window = Math.min(TREND_WINDOW, Math.floor(points.length / 2))
  if (window < MIN_TREND_WINDOW) return { points, recent: null, previous: null, window: 0 }

  const mean = (slice: GameAccuracy[]) =>
    slice.reduce((sum, entry) => sum + entry.acpl, 0) / slice.length

  return {
    points,
    recent: mean(points.slice(-window)),
    previous: mean(points.slice(-window * 2, -window)),
    window,
  }
}

export interface TimeBucket {
  label: string
  /** Lower bound in seconds, for the tooltip and the ordering. */
  from: number
  to: number | null
  moves: number
  /** Moves `isFault` marks — the two that reach a screen. */
  faults: number
  blunders: number
}

const BUCKETS: { label: string; from: number; to: number | null }[] = [
  { label: 'under 5s', from: 0, to: 5 },
  { label: '5–15s', from: 5, to: 15 },
  { label: '15–30s', from: 15, to: 30 },
  { label: '30–60s', from: 30, to: 60 },
  { label: 'over 60s', from: 60, to: null },
]

/**
 * Your analysed moves bucketed by how long you spent on them.
 *
 * Read it as a comparison with yourself rather than as a law: a hard position takes
 * longer *and* goes wrong more often, so some of any "slow moves are worse" reading is
 * the position's doing, not the clock's. The useful comparison is your own fast moves
 * against your own fast moves later.
 *
 * Needs both an analysis at the full depth and clock readings, so games with neither —
 * daily games, anything synced before clocks were captured — contribute nothing rather
 * than contributing zeros.
 */
export function mistakesByThinkTime(games: GameRecord[]): TimeBucket[] {
  const buckets: TimeBucket[] = BUCKETS.map(bucket => ({
    ...bucket,
    moves: 0,
    faults: 0,
    blunders: 0,
  }))

  for (const game of games) {
    if (!isComparable(game) || !game.clocks) continue

    const control = parseTimeControl(game.timeControl)
    const aligned = alignClocks(game.clocks, game.moves.length)
    if (!control || !aligned) continue

    const spent = timeSpentPerPly(aligned, control)

    for (const move of game.analysis?.moves ?? []) {
      const seconds = spent[move.ply]
      if (seconds === undefined) continue

      const bucket = buckets.find(entry => seconds >= entry.from && (entry.to === null || seconds < entry.to))
      if (!bucket) continue

      bucket.moves++
      if (isFault(move.tag)) bucket.faults++
      if (move.tag === '??') bucket.blunders++
    }
  }

  return buckets
}

/** Faults per hundred moves, which reads better than a percentage this small. */
export function faultRate(bucket: TimeBucket): number | null {
  return bucket.moves === 0 ? null : (bucket.faults / bucket.moves) * 100
}
