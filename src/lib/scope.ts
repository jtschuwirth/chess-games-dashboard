import { ALL_OPENINGS, UNCLASSIFIED_OPENING, type Arrival, type Filters } from './dashboard-filters'
import { matchesCriteria } from './game-filters'
import {
  arrivedPlayed,
  findPath,
  gameMatchesNode,
  gamePositionKeys,
  openingRoute,
  type GameKeys,
  type OpeningNode,
} from './opening'
import type { GameRecord } from '@/types/chess'

/** Every position each game passed through, so repeated matching costs one replay. */
export function positionKeyMap(games: GameRecord[]): Map<string, GameKeys> {
  const map = new Map<string, GameKeys>()
  for (const game of games) map.set(game.id, gamePositionKeys(game.moves))
  return map
}

/**
 * The opening half of the scope rule: all games, one saved line and everything under
 * it, or the games that reached none of the saved lines.
 */
export function matchesOpening(
  game: GameRecord,
  keys: GameKeys,
  tree: OpeningNode[],
  opening: string,
  arrival: Arrival | null = null,
): boolean {
  if (opening === ALL_OPENINGS) return true
  if (opening === UNCLASSIFIED_OPENING) {
    return !tree.some(node => gameMatchesNode(game, keys, node))
  }

  const path = findPath(tree, opening)
  if (path.length === 0) return true // a line that has since been deleted filters nothing

  const node = path[path.length - 1]
  if (!gameMatchesNode(game, keys, node)) return false
  if (!arrival) return true

  /*
    Asked of the whole subtree rather than of the one line, because that is what the
    slice is: a game that played the Caro-Kann and transposed into the Panov played its
    way into the Caro-Kann, and only transposed into the Panov. Filtering on either one
    should answer about the thing you picked.
  */
  const played = arrivedPlayed(openingRoute(tree, game, keys), node)
  return arrival === 'played' ? played : !played
}

/**
 * The dashboard's full selection — `matchesCriteria` plus the opening — so the game
 * view can walk the same slice the dashboard showed, in the same order.
 */
export function scopeGames(
  games: GameRecord[],
  tree: OpeningNode[],
  keys: Map<string, GameKeys>,
  filters: Filters,
  now: Date = new Date(),
): GameRecord[] {
  return games.filter(
    game =>
      matchesCriteria(game, filters, now) &&
      matchesOpening(game, keys.get(game.id) ?? new Map(), tree, filters.opening, filters.arrival),
  )
}

/**
 * The split behind the Arrival chips: how many of the slice played their way into the
 * picked line and how many came from somewhere else.
 *
 * Counted with every other filter in force but not this row's own — the rule the whole
 * filter panel follows, and the one that stops a chip claiming a number it would not
 * deliver. Null when no particular line is picked, which is also when the row is hidden.
 */
export function arrivalCounts(
  games: GameRecord[],
  tree: OpeningNode[],
  keys: Map<string, GameKeys>,
  filters: Filters,
  now: Date = new Date(),
): { played: number; transposed: number } | null {
  if (filters.opening === ALL_OPENINGS || filters.opening === UNCLASSIFIED_OPENING) return null

  const path = findPath(tree, filters.opening)
  if (path.length === 0) return null
  const node = path[path.length - 1]

  let played = 0
  let transposed = 0

  for (const game of scopeGames(games, tree, keys, { ...filters, arrival: null }, now)) {
    const route = openingRoute(tree, game, keys.get(game.id) ?? new Map())
    if (arrivedPlayed(route, node)) played++
    else transposed++
  }

  return { played, transposed }
}
