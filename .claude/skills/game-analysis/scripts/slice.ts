/**
 * The snapshot, read the way the app reads it.
 *
 * Everything here is a stored field or something the app derives from one. Nothing calls
 * the engine: the whole point of storing the analysis is that a question about it should
 * cost a file read.
 */
import { readFileSync } from 'node:fs'
import { normalizeAnalysis } from '@/lib/analysis'
import { alignClocks, parseTimeControl, timeSpentPerPly } from '@/lib/clocks'
import { isFault } from '@/lib/review'
import { applySettings, normalizeSettings, settings } from '@/lib/settings'
import { breadthOf, standingOf, verdictsOf } from '@/lib/verdict'
import type { GameRecord, MoveVerdict } from '@/types/chess'

const SNAPSHOT = 'C:/Users/jtsch/Desktop/Chess/chess-games-dashboard/.analysis-snapshot.json'

export interface Snapshot {
  pulledAt: number
  games: GameRecord[]
}

/** Loads the snapshot and puts the account's own settings in force, as the app does. */
export function load(): Snapshot {
  const raw = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as {
    pulledAt: number
    settings: unknown
    games: GameRecord[]
  }

  applySettings(normalizeSettings(raw.settings as never))

  // the marks are re-derived on read, exactly as getGames does
  const games = raw.games.map(game =>
    game.analysis ? { ...game, analysis: normalizeAnalysis(game.analysis) } : game,
  )

  return { pulledAt: raw.pulledAt, games }
}

export interface Filter {
  source?: GameRecord['source']
  timeControl?: string
  timeClass?: GameRecord['timeClass']
  /** Inclusive, as `new Date(y, m, d)`. */
  since?: number
  until?: number
  reviewed?: boolean
}

export function slice(games: GameRecord[], filter: Filter = {}): GameRecord[] {
  return games
    .filter(game => {
      if (game.opponentIsBot || game.source === 'upload') return false
      if (filter.source && game.source !== filter.source) return false
      if (filter.timeControl && game.timeControl !== filter.timeControl) return false
      if (filter.timeClass && game.timeClass !== filter.timeClass) return false
      if (filter.since !== undefined && game.playedAt < filter.since) return false
      if (filter.until !== undefined && game.playedAt > filter.until) return false
      if (filter.reviewed !== undefined && Boolean(game.review) !== filter.reviewed) return false
      return true
    })
    .sort((a, b) => a.playedAt - b.playedAt)
}

export interface MarkedMove {
  game: GameRecord
  ply: number
  moveNumber: number
  san: string
  tag: string
  cpBefore: number
  cpAfter: number
  from: string
  to: string
  /** Null when the second pass has not read this move: there is no `holds` without it. */
  verdict: MoveVerdict | null
  breadth: string | null
  secondsSpent: number | null
  secondsLeft: number | null
  tags: string[]
}

/**
 * Every marked move in a slice, with its verdict where one has been stored.
 *
 * `verdict` is null for a move nobody has read. That is a real hole and the caller has to
 * say so rather than quietly reporting a share of the moves it happens to know about —
 * `coverage` below is there to be printed.
 */
export function markedMoves(games: GameRecord[]): MarkedMove[] {
  const out: MarkedMove[] = []

  for (const game of games) {
    const stored = verdictsOf(game)
    const control = parseTimeControl(game.timeControl)
    const clocks = alignClocks(game.clocks ?? null, game.moves.length)
    const spent = control && clocks ? timeSpentPerPly(clocks, control) : null

    for (const move of game.analysis?.moves ?? []) {
      if (!isFault(move.tag)) continue

      const verdict = stored[String(move.ply)] ?? null
      out.push({
        game,
        ply: move.ply,
        moveNumber: move.moveNumber,
        san: move.san,
        tag: move.tag,
        cpBefore: move.cpBefore,
        cpAfter: move.cpAfter,
        from: standingOf(move.cpBefore),
        to: standingOf(move.cpAfter),
        verdict: verdict && !verdict.dismissed ? verdict : null,
        breadth: verdict && !verdict.dismissed ? breadthOf(verdict.holds) : null,
        secondsSpent: spent ? Math.round(spent[move.ply]) : null,
        secondsLeft: clocks ? Math.round(clocks[move.ply]) : null,
        tags: (game.review?.mistakes ?? []).find(entry => entry.ply === move.ply)?.tags ?? [],
      })
    }
  }

  return out
}

/** Your own moves in a slice, which is the denominator for any rate. */
export function ownMoves(games: GameRecord[]) {
  return games.flatMap(game => (game.analysis?.moves ?? []).map(move => ({ game, move })))
}

export function coverage(moves: MarkedMove[]): string {
  const read = moves.filter(move => move.verdict !== null).length
  const share = moves.length === 0 ? 0 : Math.round((read / moves.length) * 100)
  return `${read} of ${moves.length} marked moves read by the second pass (${share}%)`
}

export { settings }
