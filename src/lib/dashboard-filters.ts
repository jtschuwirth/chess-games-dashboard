import { isSinceKey, type GameCriteria, type SinceKey } from '@/lib/game-filters'
import { TIME_CLASSES } from '@/types/chess'
import type { TimeClass } from '@/types/chess'

/** Dropdown value meaning "every game", not a saved opening id. */
export const ALL_OPENINGS = 'all'

export interface Filters extends GameCriteria {
  opening: string
  unclassifiedOnly: boolean
}

export const DEFAULT_FILTERS: Filters = {
  opening: ALL_OPENINGS,
  timeClasses: [],
  since: 'all',
  minRating: null,
  maxRating: null,
  color: 'both',
  source: 'both',
  unclassifiedOnly: false,
}

function readRating(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

/** Anything unrecognised in the query string falls back to the default. */
export function readFilters(params: { get: (key: string) => string | null }): Filters {
  const color = params.get('color')
  const source = params.get('source')
  const since = params.get('since')
  const formats = (params.get('formats') ?? '')
    .split(',')
    .filter((value): value is TimeClass => (TIME_CLASSES as string[]).includes(value))

  return {
    opening: params.get('opening') || ALL_OPENINGS,
    timeClasses: formats,
    since: since && isSinceKey(since) ? (since as SinceKey) : 'all',
    minRating: readRating(params.get('minElo')),
    maxRating: readRating(params.get('maxElo')),
    color: color === 'white' || color === 'black' ? color : 'both',
    source: source === 'chesscom' || source === 'lichess' ? source : 'both',
    unclassifiedOnly: params.get('unclassified') === '1',
  }
}

/** Only non-default values reach the URL, so an unfiltered dashboard has a clean address. */
export function writeFilters(filters: Filters): string {
  const params = new URLSearchParams()
  if (filters.opening !== ALL_OPENINGS) params.set('opening', filters.opening)
  if (filters.timeClasses.length > 0) params.set('formats', filters.timeClasses.join(','))
  if (filters.since !== 'all') params.set('since', filters.since)
  if (filters.minRating !== null) params.set('minElo', String(filters.minRating))
  if (filters.maxRating !== null) params.set('maxElo', String(filters.maxRating))
  if (filters.color !== 'both') params.set('color', filters.color)
  if (filters.source !== 'both') params.set('source', filters.source)
  if (filters.unclassifiedOnly) params.set('unclassified', '1')

  const query = params.toString()
  return query ? '?' + query : ''
}
