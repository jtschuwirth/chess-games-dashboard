import type { GameRecord } from '@/types/chess'

/**
 * A rating jump larger than this between consecutive stored games means games are
 * missing from the history, so the earlier game is not really the previous one.
 */
const MAX_PLAUSIBLE_JUMP = 40

const FALLBACK_STEP = 8
const MIN_STEP = 2
const MAX_STEP = 40

export interface RatedGame extends GameRecord {
  /** Your rating going into the game. Null for the first game in a pool or across a gap. */
  ratingBefore: number | null
  /**
   * The opponent's rating going into the game. Estimated: their stored rating already
   * moved with this game's result, so it is undone by the pool's typical step.
   */
  opponentRatingBefore: number | null
  /** opponentRatingBefore - ratingBefore, the difference the Elo formula wants. */
  ratingDiff: number | null
}

/** Chess.com and Lichess both keep one rating per time class, not per exact clock. */
function poolKey(game: GameRecord): string {
  return `${game.source}|${game.timeClass}`
}

/** Expected score from a rating difference, opponent minus you. */
export function expectedScore(ratingDiff: number): number {
  return 1 / (1 + Math.pow(10, ratingDiff / 400))
}

export function actualScore(game: GameRecord): number {
  return game.result === 'win' ? 1 : game.result === 'draw' ? 0.5 : 0
}

/** Median absolute rating change between consecutive games, i.e. the pool's K in practice. */
function typicalStep(pool: GameRecord[]): number {
  const steps: number[] = []

  for (let i = 1; i < pool.length; i++) {
    const before = pool[i - 1].userRating
    const after = pool[i].userRating
    if (before === null || after === null) continue

    const step = Math.abs(after - before)
    if (step > 0 && step <= MAX_PLAUSIBLE_JUMP) steps.push(step)
  }

  if (steps.length === 0) return FALLBACK_STEP

  steps.sort((a, b) => a - b)
  const middle = steps[Math.floor(steps.length / 2)]
  return Math.min(Math.max(middle, MIN_STEP), MAX_STEP)
}

/**
 * Fills in pre-game ratings, which neither provider exposes: the rating attached to a
 * game is the one *after* it. Bucketing games by a rating difference built from those
 * numbers sorts wins into "weaker opponent" and losses into "stronger opponent" on its
 * own, so any Elo-relative analysis needs this first.
 *
 * Derived rather than stored, because syncs arrive newest-first: a game's predecessor
 * often lands in a later sync, and a stored value would stay wrong.
 */
export function withRatingsBefore(games: GameRecord[]): RatedGame[] {
  const pools = new Map<string, GameRecord[]>()
  for (const game of games) {
    const key = poolKey(game)
    const pool = pools.get(key)
    if (pool) pool.push(game)
    else pools.set(key, [game])
  }

  const byId = new Map<string, RatedGame>()

  for (const pool of pools.values()) {
    pool.sort((a, b) => a.playedAt - b.playedAt)
    const step = typicalStep(pool)

    pool.forEach((game, index) => {
      const previous = index > 0 ? pool[index - 1].userRating : null
      const plausible =
        previous !== null &&
        game.userRating !== null &&
        Math.abs(game.userRating - previous) <= MAX_PLAUSIBLE_JUMP

      const ratingBefore = plausible ? previous : null

      // undo the move the opponent's rating made because of this very game
      const opponentRatingBefore =
        game.opponentRating === null
          ? null
          : game.opponentRating + (game.result === 'win' ? step : game.result === 'loss' ? -step : 0)

      byId.set(game.id, {
        ...game,
        ratingBefore,
        opponentRatingBefore,
        ratingDiff:
          ratingBefore !== null && opponentRatingBefore !== null
            ? opponentRatingBefore - ratingBefore
            : null,
      })
    })
  }

  // keep the caller's original ordering
  return games.map(game => byId.get(game.id) as RatedGame)
}
