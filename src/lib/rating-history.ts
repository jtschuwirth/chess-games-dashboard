import { addDays, chessDayKey, dayKey, keyToDate, yearOf } from './days'
import type { GameRecord, Source, TimeClass } from '@/types/chess'

/**
 * Your rating at the close of each day you played, per pool.
 *
 * Derived from the games and then stored, which is unusual here — almost everything else
 * is computed on read. The reason is that it has to outlive the games it came from: the
 * app holds the last N games you synced, so once older games age out, the only record
 * that you were 1550 in March is this one. Rebuilt from whatever games are present on
 * every sync, and a rebuild only ever adds days, never removes them.
 */

export interface TrackedPool {
  /** Stable key, used in storage and in the UI. */
  id: string
  source: Source
  timeClass: TimeClass
  label: string
  /** Short form for a chart legend. */
  short: string
}

/**
 * The pools worth following. A rating only means something against the pool it was
 * earned in — a site keeps one per time class — so these are named pairs rather than one
 * number, and the list is short because tracking everything tracks nothing.
 */
export const TRACKED_POOLS: TrackedPool[] = [
  {
    id: 'chesscom:rapid',
    source: 'chesscom',
    timeClass: 'rapid',
    label: 'chess.com rapid',
    short: 'cc rapid',
  },
  {
    id: 'chesscom:blitz',
    source: 'chesscom',
    timeClass: 'blitz',
    label: 'chess.com blitz',
    short: 'cc blitz',
  },
  {
    id: 'lichess:classical',
    source: 'lichess',
    timeClass: 'classical',
    label: 'lichess classical',
    short: 'li classical',
  },
]

export function poolById(id: string): TrackedPool | undefined {
  return TRACKED_POOLS.find(pool => pool.id === id)
}

/** `{ '2026-10-04': { 'chesscom:rapid': 1624 } }` — only days that had a game. */
export type RatingHistory = Record<string, Record<string, number>>

/** One stored document per year, so a long history is a handful of reads, not hundreds. */
export interface RatingYear {
  year: string
  days: RatingHistory
}

/**
 * Which pool a game counts towards, or null when it counts towards none.
 *
 * Uploads are left out for the same reason they are left out of every split: a game you
 * brought in to study is not your record. Engine games never were.
 */
function poolOf(game: GameRecord): TrackedPool | null {
  if (game.opponentIsBot || game.source === 'upload' || game.userRating === null) return null
  return (
    TRACKED_POOLS.find(
      pool => pool.source === game.source && pool.timeClass === game.timeClass,
    ) ?? null
  )
}

/**
 * The closing rating of every day that had a game, from the games given.
 *
 * "Closing" is the rating after the last game of that chess day — which runs 6am to 6am,
 * so a session that ran past midnight closes the day it started in. Stored ratings are
 * post-game on both providers, so the last game's `userRating` is already the close.
 */
export function closingRatings(games: GameRecord[]): RatingHistory {
  const latest = new Map<string, { playedAt: number; rating: number }>()

  for (const game of games) {
    const pool = poolOf(game)
    if (!pool) continue

    const key = `${chessDayKey(game.playedAt)}|${pool.id}`
    const current = latest.get(key)
    if (!current || game.playedAt > current.playedAt) {
      latest.set(key, { playedAt: game.playedAt, rating: game.userRating as number })
    }
  }

  const history: RatingHistory = {}
  for (const [key, entry] of latest) {
    const [day, poolId] = key.split('|')
    history[day] = { ...history[day], [poolId]: entry.rating }
  }
  return history
}

/**
 * A rebuild merged onto what is already stored, newer days winning.
 *
 * Only ever adds: the games that produced an old day may be long gone from the app, and
 * a rebuild that dropped those days would quietly erase the history it exists to keep.
 */
export function mergeHistory(stored: RatingHistory, rebuilt: RatingHistory): RatingHistory {
  const merged: RatingHistory = { ...stored }
  for (const [day, pools] of Object.entries(rebuilt)) {
    merged[day] = { ...merged[day], ...pools }
  }
  return merged
}

/** Split for storage, one document per year. */
export function splitByYear(history: RatingHistory): RatingYear[] {
  const years = new Map<string, RatingHistory>()

  for (const [day, pools] of Object.entries(history)) {
    const year = yearOf(day)
    years.set(year, { ...years.get(year), [day]: pools })
  }

  return [...years.entries()]
    .map(([year, days]) => ({ year, days }))
    .sort((a, b) => a.year.localeCompare(b.year))
}

export function joinYears(years: RatingYear[]): RatingHistory {
  return years.reduce<RatingHistory>((all, year) => ({ ...all, ...year.days }), {})
}

/**
 * Your rating in a pool on a given day: that day's close, or the last close before it.
 *
 * Carried forward rather than stored per day, because a rating does not change on a day
 * you did not play — writing it down again would be the same number on a thousand rows.
 */
export function ratingOn(history: RatingHistory, poolId: string, day: string): number | null {
  const exact = history[day]?.[poolId]
  if (typeof exact === 'number') return exact

  let best: { day: string; rating: number } | null = null
  for (const [key, pools] of Object.entries(history)) {
    const rating = pools[poolId]
    if (typeof rating !== 'number' || key > day) continue
    if (!best || key > best.day) best = { day: key, rating }
  }
  return best?.rating ?? null
}

/** The day keys the history knows about, oldest first. */
export function daysKnown(history: RatingHistory): string[] {
  return Object.keys(history).sort()
}

export interface RatingPoint {
  day: string
  /** Local midnight of that day, for formatting. */
  at: number
  rating: number
}

export interface PoolSeries {
  pool: TrackedPool
  points: RatingPoint[]
  first: number | null
  last: number | null
  change: number | null
  low: number | null
  high: number | null
}

/**
 * One series per pool across a date range, with a point on every day in it.
 *
 * Every day rather than only the days you played, because gaps in a rating chart read as
 * volatility that is not there: a fortnight off looks like a cliff when the two games
 * either side are drawn next to each other. A flat stretch is the truth.
 */
export function seriesInRange(
  history: RatingHistory,
  from: number,
  to: number,
  pools: TrackedPool[] = TRACKED_POOLS,
): PoolSeries[] {
  return pools.map(pool => {
    const points: RatingPoint[] = []

    for (let at = from; at <= to; at = addDays(at, 1)) {
      const day = dayKey(at)
      const rating = ratingOn(history, pool.id, day)
      if (rating !== null) points.push({ day, at, rating })
    }

    const values = points.map(point => point.rating)

    return {
      pool,
      points,
      first: values[0] ?? null,
      last: values[values.length - 1] ?? null,
      change: values.length >= 2 ? values[values.length - 1] - values[0] : null,
      low: values.length > 0 ? Math.min(...values) : null,
      high: values.length > 0 ? Math.max(...values) : null,
    }
  })
}

/** The first and last day anything is known about, for a default range. */
export function historyRange(history: RatingHistory): { from: number; to: number } | null {
  const days = daysKnown(history)
  if (days.length === 0) return null
  return { from: keyToDate(days[0]), to: keyToDate(days[days.length - 1]) }
}
