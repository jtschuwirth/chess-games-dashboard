import { endingPhaseOf, timeControlKey } from '@/lib/clocks'
import { hasReview, tagsOf } from '@/lib/review'
import type { Color, GameRecord, Source } from '@/types/chess'

export type SinceKey = 'all' | '1w' | '1m' | '3m' | '6m' | '12m' | '24m' | '36m'

/**
 * Windows carry months *or* days, because a week is not a fraction of a month and
 * approximating it as one would make "last week" drift by a couple of days a year.
 */
export const SINCE_OPTIONS: { value: SinceKey; label: string; months: number; days: number }[] = [
  { value: 'all', label: 'all time', months: 0, days: 0 },
  { value: '1w', label: '1 week', months: 0, days: 7 },
  { value: '1m', label: '1 month', months: 1, days: 0 },
  { value: '3m', label: '3 months', months: 3, days: 0 },
  { value: '6m', label: '6 months', months: 6, days: 0 },
  { value: '12m', label: '1 year', months: 12, days: 0 },
  { value: '24m', label: '2 years', months: 24, days: 0 },
  { value: '36m', label: '3 years', months: 36, days: 0 },
]

const OPTION_BY_KEY = new Map(SINCE_OPTIONS.map(option => [option.value, option]))

export function isSinceKey(value: string): value is SinceKey {
  return OPTION_BY_KEY.has(value as SinceKey)
}

/** Epoch ms of the window start, or null for "all time". */
export function sinceTimestamp(since: SinceKey, now: Date = new Date()): number | null {
  const option = OPTION_BY_KEY.get(since)
  if (!option || (option.months === 0 && option.days === 0)) return null

  const start = new Date(now)
  if (option.months > 0) start.setMonth(start.getMonth() - option.months)
  if (option.days > 0) start.setDate(start.getDate() - option.days)
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
   * already analysed, and 'unanalysed' exactly the ones it has never seen. Null leaves
   * the set alone.
   */
  mistakes: 'blunder' | 'mistake' | 'clean' | 'analysed' | 'unanalysed' | null
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

  /*
   * Uploaded games are not part of your record. They are games you brought in to study —
   * someone else's, or one off a board — and counting them would make every split answer
   * a different question from the one it claims to. They are still reachable by asking
   * for them by name, which is what the Uploaded source is for.
   */
  if (game.source === 'upload' && criteria.source !== 'upload') return false

  if (criteria.source !== 'both' && game.source !== criteria.source) return false
  if (criteria.endedIn !== null && endingPhaseOf(game) !== criteria.endedIn) return false

  if (criteria.mistakes !== null) {
    const analysis = game.analysis
    if (criteria.mistakes === 'unanalysed') {
      if (analysis) return false
    } else {
      if (!analysis) return false
      if (criteria.mistakes === 'blunder' && analysis.blunders === 0) return false
      if (criteria.mistakes === 'mistake' && analysis.mistakes === 0) return false
      if (criteria.mistakes === 'clean' && analysis.blunders + analysis.mistakes > 0) return false
    }
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
