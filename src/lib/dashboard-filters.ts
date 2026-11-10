import { isSinceKey, type GameCriteria, type SinceKey } from '@/lib/game-filters'
import { SOURCE_LABEL, type Source } from '@/types/chess'
import { ARCS, GAME_NAMES, OFF_BOARD, TEXTURES, type Arc } from '@/lib/shape'

/** Dropdown value meaning "every game", not a saved opening id. */
export const ALL_OPENINGS = 'all'

/** Dropdown value meaning "games that reached none of the saved openings". */
export const UNCLASSIFIED_OPENING = 'unclassified'

/**
 * How the game got into the opening you picked: by its own move order, or from
 * somewhere else. It only means anything once a particular line is picked, which is
 * why the row that sets it appears only then.
 */
export type Arrival = 'played' | 'transposed'

export interface Filters extends GameCriteria {
  opening: string
  arrival: Arrival | null
}

export const DEFAULT_FILTERS: Filters = {
  opening: ALL_OPENINGS,
  arrival: null,
  timeControls: [],
  since: 'all',
  minRating: null,
  maxRating: null,
  color: 'both',
  source: 'both',
  endedIn: null,
  mistakes: null,
  shape: null,
  reviewed: null,
  tag: null,
}

function readRating(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

const MISTAKE_VALUES = ['blunder', 'mistake', 'clean', 'analysed', 'unanalysed', 'stale'] as const

function readMistakes(raw: string | null): GameCriteria['mistakes'] {
  return MISTAKE_VALUES.includes(raw as (typeof MISTAKE_VALUES)[number])
    ? (raw as GameCriteria['mistakes'])
    : null
}

function readReviewed(raw: string | null): GameCriteria['reviewed'] {
  return raw === 'yes' || raw === 'no' ? raw : null
}

function readArrival(raw: string | null): Arrival | null {
  return raw === 'played' || raw === 'transposed' ? raw : null
}

/** Anything unrecognised in the query string falls back to the default. */
/** `arc:<id>` or `name:<name>`, and nothing else — a hand-typed URL cannot invent one. */
function readShape(raw: string | null): string | null {
  if (!raw) return null
  if (raw.startsWith('arc:')) return ARCS.includes(raw.slice(4) as Arc) ? raw : null
  if (!raw.startsWith('name:')) return null

  const name = raw.slice(5)
  const known =
    ARCS.some(arc => TEXTURES.some(texture => GAME_NAMES[arc][texture] === name)) ||
    OFF_BOARD.some(row => row.name === name)
  return known ? raw : null
}

/**
 * The sites a slice can be narrowed to, read off the one list of them.
 *
 * It was spelled out here as `chesscom || lichess` and went stale the day uploads became
 * a third source: the chip set `source=upload`, `writeFilters` put it in the address, and
 * this read it straight back out as `both`. So the filter worked until the page was
 * reloaded, linked to, or returned to from a game — and uploads are the one source whose
 * games are *invisible* without it, so the whole slice emptied rather than widening.
 *
 * `SOURCE_LABEL` is the vocabulary, so a fourth source arrives readable rather than
 * silently unreadable. `Object.hasOwn` and not `in`, which walks the prototype — with
 * `in`, `?source=toString` is a site.
 */
function readSource(raw: string | null): Filters['source'] {
  return raw !== null && Object.hasOwn(SOURCE_LABEL, raw) ? (raw as Source) : 'both'
}

export function readFilters(params: { get: (key: string) => string | null }): Filters {
  const color = params.get('color')
  const since = params.get('since')
  // canonical control ids, e.g. "180+2"
  const controls = (params.get('tc') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^\d+\+\d+$/.test(value))

  return {
    opening: params.get('opening') || ALL_OPENINGS,
    arrival: readArrival(params.get('arrival')),
    timeControls: controls,
    since: since && isSinceKey(since) ? (since as SinceKey) : 'all',
    minRating: readRating(params.get('minElo')),
    maxRating: readRating(params.get('maxElo')),
    color: color === 'white' || color === 'black' ? color : 'both',
    source: readSource(params.get('source')),
    endedIn: params.get('phase') || null,
    mistakes: readMistakes(params.get('mistakes')),
    shape: readShape(params.get('shape')),
    reviewed: readReviewed(params.get('review')),
    tag: params.get('tag') || null,
  }
}

/** Only non-default values reach the URL, so an unfiltered dashboard has a clean address. */
export function writeFilters(filters: Filters): string {
  const params = new URLSearchParams()
  if (filters.opening !== ALL_OPENINGS) params.set('opening', filters.opening)
  if (filters.arrival) params.set('arrival', filters.arrival)
  if (filters.timeControls.length > 0) params.set('tc', filters.timeControls.join(','))
  if (filters.since !== 'all') params.set('since', filters.since)
  if (filters.minRating !== null) params.set('minElo', String(filters.minRating))
  if (filters.maxRating !== null) params.set('maxElo', String(filters.maxRating))
  if (filters.color !== 'both') params.set('color', filters.color)
  if (filters.source !== 'both') params.set('source', filters.source)
  if (filters.endedIn) params.set('phase', filters.endedIn)
  if (filters.mistakes) params.set('mistakes', filters.mistakes)
  if (filters.shape) params.set('shape', filters.shape)
  if (filters.reviewed) params.set('review', filters.reviewed)
  if (filters.tag) params.set('tag', filters.tag)

  const query = params.toString()
  return query ? '?' + query : ''
}
