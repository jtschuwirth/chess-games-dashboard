import { isStale } from './analysis'
import { thinkPerPly } from './clocks'
import { isFault } from './review'
import type { GameRecord, GameResult } from '@/types/chess'

/**
 * Two readings over games the engine has already been through: how much you give away
 * per move, and whether it depends on how long you thought.
 *
 * Both only count games analysed by the current build. A shallower engine finds fewer
 * mistakes and scores them smaller, so mixing versions would show you improving at the
 * moment the depth changed — which is exactly what happened here when it settled at 21
 * and older games kept their 12. One depth or the number means nothing, and `isStale` is
 * now the single place that decides which games are on the same footing.
 */
export function isComparable(game: GameRecord): boolean {
  return game.analysis !== undefined && !isStale(game)
}

/** How many games in a slice the engine has looked at closely enough to count. */
export function comparableGames(games: GameRecord[]): GameRecord[] {
  return games.filter(isComparable)
}

/**
 * The window an evaluation is squeezed into before a loss is measured.
 *
 * Stored evaluations run to `MATE_SCORE` (10000), so a move that walks into a forced
 * mate scores a loss of about 9,800 — which in a 44-move game adds 223 to that game's
 * average on its own, and drowns every other move in it. Two lost games were enough to
 * put a real reading at 126 when the true figure was a fraction of that.
 *
 * Clamping both ends into ±1000 first is what lichess does, and it has a second effect
 * worth having: a slip made when you were already lost comes out at zero, since both
 * ends are pinned to the same wall. That is the rule `classifyMove` already follows —
 * nothing left to throw away — so accuracy and the marks now agree about what counts.
 */
export const ACCURACY_CAP = 1000

function capped(cp: number): number {
  return Math.max(-ACCURACY_CAP, Math.min(ACCURACY_CAP, cp))
}

/**
 * What one move gave away, measured inside the window. Never negative: a move the engine
 * likes more afterwards is not credit against a blunder elsewhere.
 */
export function cappedLoss(move: { cpBefore: number; cpAfter: number }): number {
  return Math.max(0, capped(move.cpBefore) - capped(move.cpAfter))
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
 * Average centipawn loss for one game, in centipawns per move of yours — 100 is a pawn.
 * Null when the game is not comparable.
 *
 * Measured from the stored evaluations through `cappedLoss` rather than from the stored
 * `cpLoss`, which is the raw difference and runs to five figures around a mate. Deriving
 * it on read means no game has to be analysed again for the figure to be worth reading.
 */
export function gameAccuracy(game: GameRecord): GameAccuracy | null {
  if (!isComparable(game)) return null

  const moves = game.analysis?.moves ?? []
  if (moves.length === 0) return null

  const total = moves.reduce((sum, move) => sum + cappedLoss(move), 0)

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

/**
 * The bands, in seconds. The long end is split three ways rather than one because in a
 * slow control most moves land past a minute — a single "over 60s" bucket held more of
 * the game than every other band put together, which tells you nothing about the game.
 *
 * Labels switch to minutes past a minute: "1–3m" is read at a glance where "60–180s"
 * has to be converted first.
 */
export const THINK_BANDS: { label: string; from: number; to: number | null }[] = [
  { label: 'under 5s', from: 0, to: 5 },
  { label: '5–15s', from: 5, to: 15 },
  { label: '15–30s', from: 15, to: 30 },
  { label: '30–60s', from: 30, to: 60 },
  { label: '1–3m', from: 60, to: 180 },
  { label: '3–5m', from: 180, to: 300 },
  { label: 'over 5m', from: 300, to: null },
]

/**
 * Which band a think time falls in, by its label.
 *
 * Each band owns its lower bound and not its upper, so there is no second where a move
 * belongs to two. The label is the value anything filtering by this stores, the same
 * bargain a phase label makes: move a boundary and the slice it named stops existing.
 */
export function thinkBandOf(seconds: number): string | null {
  const band = THINK_BANDS.find(
    entry => seconds >= entry.from && (entry.to === null || seconds < entry.to),
  )
  return band?.label ?? null
}

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
  const buckets: TimeBucket[] = THINK_BANDS.map(bucket => ({
    ...bucket,
    moves: 0,
    faults: 0,
    blunders: 0,
  }))

  for (const game of games) {
    // the depth guard is this reading's own: it is a RATE, and a shallower engine finds
    // fewer faults in the numerator. A think time is a clock measurement and needs none.
    if (!isComparable(game)) continue

    const spent = thinkPerPly(game)
    if (!spent) continue

    for (const move of game.analysis?.moves ?? []) {
      const seconds = spent[move.ply]
      if (seconds === undefined) continue

      const label = thinkBandOf(seconds)
      const bucket = buckets.find(entry => entry.label === label)
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
