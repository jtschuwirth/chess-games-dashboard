import { isSinceKey, type GameCriteria, type SinceKey } from '@/lib/game-filters'

/** Dropdown value meaning "every game", not a saved opening id. */
export const ALL_OPENINGS = 'all'

/** Dropdown value meaning "games that reached none of the saved openings". */
export const UNCLASSIFIED_OPENING = 'unclassified'

export interface Filters extends GameCriteria {
  opening: string
}

export const DEFAULT_FILTERS: Filters = {
  opening: ALL_OPENINGS,
  timeControls: [],
  since: 'all',
  minRating: null,
  maxRating: null,
  color: 'both',
  source: 'both',
  endedIn: null,
  mistakes: null,
  reviewed: null,
  tag: null,
}

function readRating(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

const MISTAKE_VALUES = ['blunder', 'mistake', 'clean', 'analysed'] as const

function readMistakes(raw: string | null): GameCriteria['mistakes'] {
  return MISTAKE_VALUES.includes(raw as (typeof MISTAKE_VALUES)[number])
    ? (raw as GameCriteria['mistakes'])
    : null
}

function readReviewed(raw: string | null): GameCriteria['reviewed'] {
  return raw === 'yes' || raw === 'no' ? raw : null
}

/** Anything unrecognised in the query string falls back to the default. */
export function readFilters(params: { get: (key: string) => string | null }): Filters {
  const color = params.get('color')
  const source = params.get('source')
  const since = params.get('since')
  // canonical control ids, e.g. "180+2"
  const controls = (params.get('tc') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^\d+\+\d+$/.test(value))

  return {
    opening: params.get('opening') || ALL_OPENINGS,
    timeControls: controls,
    since: since && isSinceKey(since) ? (since as SinceKey) : 'all',
    minRating: readRating(params.get('minElo')),
    maxRating: readRating(params.get('maxElo')),
    color: color === 'white' || color === 'black' ? color : 'both',
    source: source === 'chesscom' || source === 'lichess' ? source : 'both',
    endedIn: params.get('phase') || null,
    mistakes: readMistakes(params.get('mistakes')),
    reviewed: readReviewed(params.get('review')),
    tag: params.get('tag') || null,
  }
}

/** Only non-default values reach the URL, so an unfiltered dashboard has a clean address. */
export function writeFilters(filters: Filters): string {
  const params = new URLSearchParams()
  if (filters.opening !== ALL_OPENINGS) params.set('opening', filters.opening)
  if (filters.timeControls.length > 0) params.set('tc', filters.timeControls.join(','))
  if (filters.since !== 'all') params.set('since', filters.since)
  if (filters.minRating !== null) params.set('minElo', String(filters.minRating))
  if (filters.maxRating !== null) params.set('maxElo', String(filters.maxRating))
  if (filters.color !== 'both') params.set('color', filters.color)
  if (filters.source !== 'both') params.set('source', filters.source)
  if (filters.endedIn) params.set('phase', filters.endedIn)
  if (filters.mistakes) params.set('mistakes', filters.mistakes)
  if (filters.reviewed) params.set('review', filters.reviewed)
  if (filters.tag) params.set('tag', filters.tag)

  const query = params.toString()
  return query ? '?' + query : ''
}
