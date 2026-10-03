import { endingPhaseOf, timeControlKey } from '@/lib/clocks'
import { hasReview, tagsOf } from '@/lib/review'
import type { Color, GameRecord, Source } from '@/types/chess'

export type SinceKey = 'all' | '1m' | '3m' | '6m' | '12m' | '24m' | '36m'

export const SINCE_OPTIONS: { value: SinceKey; label: string; months: number }[] = [
  { value: 'all', label: 'all time', months: 0 },
  { value: '1m', label: '1 month', months: 1 },
  { value: '3m', label: '3 months', months: 3 },
  { value: '6m', label: '6 months', months: 6 },
  { value: '12m', label: '1 year', months: 12 },
  { value: '24m', label: '2 years', months: 24 },
  { value: '36m', label: '3 years', months: 36 },
]

const MONTHS_BY_KEY = new Map(SINCE_OPTIONS.map(option => [option.value, option.months]))

export function isSinceKey(value: string): value is SinceKey {
  return MONTHS_BY_KEY.has(value as SinceKey)
}

/** Epoch ms of the window start, or null for "all time". */
export function sinceTimestamp(since: SinceKey, now: Date = new Date()): number | null {
  const months = MONTHS_BY_KEY.get(since) ?? 0
  if (months === 0) return null

  const start = new Date(now)
  start.setMonth(start.getMonth() - months)
  return start.getTime()
}

export interface GameCriteria {
  /**
   * Canonical time controls (`180+2`), empty for any. Clock behaviour differs sharply
   * inside one time class — 10+0 and 15+10 are both "rapid" — so the filter works at
   * the control level, not the class level.
   */
  timeControls: string[]
  /** Which site the game came from, or 'both'. */
  source: Source | 'both'
  /** Only games whose last move fell in this phase, by its label. Null for any. */
  endedIn: string | null
  /**
   * Narrow to what the engine found. 'blunder' / 'mistake' keep games containing at
   * least one; 'clean' keeps analysed games with neither; 'analysed' keeps anything
   * already analysed. Null leaves the set alone.
   */
  mistakes: 'blunder' | 'mistake' | 'clean' | 'analysed' | null
  /**
   * Your own review: 'yes' for games you have taken apart, 'no' for the ones still
   * waiting. Null leaves the set alone.
   */
  reviewed: 'yes' | 'no' | null
  /**
   * One tag from your review vocabulary. Only entries you did *not* mark as
   * unreasonable count, so the tag filter and the tag counts always agree.
   */
  tag: string | null
  /** The side you played, or 'both'. */
  color: Color | 'both'
  since: SinceKey
  /** Your own rating at the time of the game, not the opponent's. */
  minRating: number | null
  maxRating: number | null
}

export const ALL_GAMES: GameCriteria = {
  timeControls: [],
  source: 'both',
  endedIn: null,
  mistakes: null,
  reviewed: null,
  tag: null,
  color: 'both',
  since: 'all',
  minRating: null,
  maxRating: null,
}

/**
 * The one place that decides whether a game is in scope, so the dashboard and the
 * export endpoint can never drift apart. Games with no recorded rating survive a
 * rating filter rather than silently disappearing.
 */
export function matchesCriteria(
  game: GameRecord,
  criteria: GameCriteria,
  now: Date = new Date(),
): boolean {
  if (criteria.timeControls.length > 0) {
    const key = timeControlKey(game.timeControl)
    if (key === null || !criteria.timeControls.includes(key)) return false
  }

  // engine games are never part of the analysis: they say nothing about play against people
  if (game.opponentIsBot) return false

  if (criteria.source !== 'both' && game.source !== criteria.source) return false
  if (criteria.endedIn !== null && endingPhaseOf(game) !== criteria.endedIn) return false

  if (criteria.mistakes !== null) {
    const analysis = game.analysis
    if (!analysis) return false
    if (criteria.mistakes === 'blunder' && analysis.blunders === 0) return false
    if (criteria.mistakes === 'mistake' && analysis.mistakes === 0) return false
    if (criteria.mistakes === 'clean' && analysis.blunders + analysis.mistakes > 0) return false
  }

  if (criteria.reviewed === 'yes' && !hasReview(game)) return false
  if (criteria.reviewed === 'no' && hasReview(game)) return false
  if (criteria.tag !== null && !tagsOf(game).includes(criteria.tag)) return false

  if (criteria.color !== 'both' && game.color !== criteria.color) return false

  const start = sinceTimestamp(criteria.since, now)
  if (start !== null && game.playedAt < start) return false

  if (game.userRating !== null) {
    if (criteria.minRating !== null && game.userRating < criteria.minRating) return false
    if (criteria.maxRating !== null && game.userRating > criteria.maxRating) return false
  }

  return true
}
