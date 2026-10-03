import { ALL_OPENINGS, UNCLASSIFIED_OPENING, type Filters } from './dashboard-filters'
import { matchesCriteria } from './game-filters'
import { findPath, gameMatchesNode, gamePositionKeys, type PatternNode } from './pattern'
import type { GameRecord } from '@/types/chess'

/** Every position each game passed through, so repeated matching costs one replay. */
export function positionKeyMap(games: GameRecord[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const game of games) map.set(game.id, gamePositionKeys(game.moves))
  return map
}

/**
 * The opening half of the scope rule: all games, one saved line and everything under
 * it, or the games that reached none of the saved lines.
 */
export function matchesOpening(
  game: GameRecord,
  keys: Set<string>,
  tree: PatternNode[],
  opening: string,
): boolean {
  if (opening === ALL_OPENINGS) return true
  if (opening === UNCLASSIFIED_OPENING) {
    return !tree.some(node => gameMatchesNode(game, keys, node))
  }

  const path = findPath(tree, opening)
  if (path.length === 0) return true // a line that has since been deleted filters nothing

  return gameMatchesNode(game, keys, path[path.length - 1])
}

/**
 * The dashboard's full selection — `matchesCriteria` plus the opening — so the game
 * view can walk the same slice the dashboard showed, in the same order.
 */
export function scopeGames(
  games: GameRecord[],
  tree: PatternNode[],
  keys: Map<string, Set<string>>,
  filters: Filters,
  now: Date = new Date(),
): GameRecord[] {
  return games.filter(
    game =>
      matchesCriteria(game, filters, now) &&
      matchesOpening(game, keys.get(game.id) ?? new Set(), tree, filters.opening),
  )
}
