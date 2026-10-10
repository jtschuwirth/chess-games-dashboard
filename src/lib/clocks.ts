import { settings, type AnalysisSettings } from './settings'
import { computeStats, type StatBlock } from './stats'
import { isFlagged } from './termination'
import type { GameRecord } from '@/types/chess'

/** How many of the user's own moves count as "the opening" for time-usage purposes. */
export const OPENING_MOVES = 10

export interface TimeControl {
  /** Starting seconds on the clock. */
  base: number
  /** Seconds added per move. */
  increment: number
}

/**
 * "180+2" -> 180s + 2s. "300" -> 300s, no increment. Daily and unlimited games
 * ("1/86400", "3 days", "unlimited") return null — per-move timing means nothing there.
 */
export function parseTimeControl(raw: string): TimeControl | null {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(raw.trim())
  if (!match) return null

  const base = Number(match[1])
  if (!Number.isFinite(base) || base <= 0) return null

  return { base, increment: match[2] ? Number(match[2]) : 0 }
}

/**
 * Seconds spent on each ply. A player's own clock only appears every other entry, so
 * the previous reading for ply `i` is at `i - 2`; the first two plies measure against
 * the starting time. The increment is added back because the stored reading already
 * includes it.
 */
export function timeSpentPerPly(clocks: number[], control: TimeControl): number[] {
  return clocks.map((left, index) => {
    const previous = index < 2 ? control.base : clocks[index - 2]
    const spent = previous - left + control.increment
    // clamp: providers round, and a clock can be adjusted by the server
    return Math.max(0, Math.round(spent * 10) / 10)
  })
}

/**
 * A canonical id for a time control, so chess.com's "600" and lichess's "600+0" are
 * recognised as the same clock. Null for daily and unlimited games.
 */
export function timeControlKey(raw: string): string | null {
  const control = parseTimeControl(raw)
  return control ? `${control.base}+${control.increment}` : null
}

/**
 * How long something took, as opposed to what a clock reads: 93 -> "1m 33s". The two
 * are different quantities and are written differently on purpose.
 */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return `${whole}s`
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`
}

/**
 * Seconds on a clock as a clock shows them: 546 -> "9:06". A bare "546s left" is a
 * number you have to convert in your head before it means anything.
 */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = String(whole % 60).padStart(2, '0')

  if (minutes < 60) return `${minutes}:${rest}`
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`
}

/** "180+2" -> "3+2", the way players say it. Falls back to the raw string. */
export function formatTimeControl(raw: string): string {
  const control = parseTimeControl(raw)
  if (!control) return raw

  const minutes = control.base / 60
  const shown = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1)
  return `${shown}+${control.increment}`
}

/** Controls present in a set of games, fastest first, with how many games each has. */
export function timeControlsIn(games: GameRecord[]): { key: string; label: string; games: number }[] {
  const counts = new Map<string, number>()

  for (const game of games) {
    const key = timeControlKey(game.timeControl)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: formatTimeControl(key), games: count }))
    .sort((a, b) => {
      const [baseA, incA] = a.key.split('+').map(Number)
      const [baseB, incB] = b.key.split('+').map(Number)
      return baseA - baseB || incA - incB
    })
}

/**
 * Readings are in move order, so reading `i` belongs to ply `i`, and anything past the
 * move list is dropped from the END.
 *
 * This used to trim from the front, on the belief that lichess prepends the starting
 * clock. It does not. Lichess sometimes returns one reading more than there are moves —
 * the clock as the game ended, after the last move was played — and trimming the front
 * shifted every reading onto the next ply, which handed each player's think to their
 * opponent. Checked against one game's own PGN, `clocks[i]` agreed with ply `i` on
 * 107 plies out of 107, and the shifted reading on 1.
 *
 * Null when there are fewer readings than plies, where the alignment is unknowable.
 */
export function alignClocks(clocks: number[], plies: number): number[] | null {
  if (plies === 0 || clocks.length < plies) return null
  return clocks.slice(0, plies)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export interface ClockUsage {
  /** Seconds spent on each of the user's own moves, in order. */
  spent: number[]
  /** Seconds left after each of the user's own moves, in order. */
  remaining: number[]
  /** The control's starting time, for normalizing across formats. */
  base: number
  /** Seconds left on the user's clock when the game ended. */
  timeLeft: number
  medianPerMove: number
  slowestMove: number
  /** Seconds spent across the user's first `OPENING_MOVES` moves. */
  openingSeconds: number
  /** That opening time as a share of everything the user spent. */
  openingShare: number
}

/** Null whenever the game carries no usable clock data. */
export function clockUsage(game: GameRecord): ClockUsage | null {
  if (!game.clocks || game.clocks.length === 0) return null

  const control = parseTimeControl(game.timeControl)
  if (!control) return null

  const clocks = alignClocks(game.clocks, game.moves.length)
  if (!clocks) return null

  const perPly = timeSpentPerPly(clocks, control)

  // White moves on even plies
  const offset = game.color === 'white' ? 0 : 1
  const spent: number[] = []
  const remaining: number[] = []

  for (let index = offset; index < perPly.length; index += 2) {
    spent.push(perPly[index])
    remaining.push(clocks[index])
  }

  if (spent.length === 0) return null

  const total = spent.reduce((sum, seconds) => sum + seconds, 0)
  const openingSeconds = spent.slice(0, OPENING_MOVES).reduce((sum, s) => sum + s, 0)

  return {
    spent,
    remaining,
    base: control.base,
    timeLeft: remaining[remaining.length - 1],
    medianPerMove: median(spent),
    slowestMove: Math.max(...spent),
    openingSeconds: Math.round(openingSeconds * 10) / 10,
    openingShare: total > 0 ? Math.round((openingSeconds / total) * 1000) / 10 : 0,
  }
}

export interface GamePhase {
  name: string
  label: string
  from: number
  to: number
}

/**
 * Phases of a game, in your own move numbers, from the account's own settings.
 *
 * Each one ends where the next begins and the last runs to the end, so they are
 * contiguous by construction rather than by care — the stored shape holds only where
 * each starts. A function rather than a constant now that the boundaries are yours to
 * move; every caller reads it at the moment it needs it, so changing a boundary
 * re-reads your whole history with no engine and nothing stored.
 */
export function gamePhases(config: AnalysisSettings = settings()): GamePhase[] {
  return config.phases.map((phase, index) => {
    const next = config.phases[index + 1]
    const to = next ? next.from - 1 : Infinity
    return {
      name: phase.name,
      label: next ? (phase.from === to ? `${phase.from}` : `${phase.from}-${to}`) : `${phase.from}+`,
      from: phase.from,
      to,
    }
  })
}

/** How many moves the user themselves made, which is what the phase ranges count. */
export function userMoveCount(game: GameRecord): number {
  const offset = game.color === 'white' ? 0 : 1
  return Math.max(0, Math.floor((game.moves.length - offset + 1) / 2))
}

/**
 * The phase a game ended in, by the label the phase table uses.
 *
 * The label is also the stored filter value (`?phase=11-15`). Moving a boundary
 * therefore renames a phase, and a link to the old one stops matching — which is the
 * honest outcome: the slice it named no longer exists.
 */
export function endingPhaseOf(game: GameRecord, config: AnalysisSettings = settings()): string | null {
  const moves = userMoveCount(game)
  return gamePhases(config).find(phase => moves >= phase.from && moves <= phase.to)?.label ?? null
}

export interface PhaseBucket {
  /** What happens in this stretch of the game. */
  name: string
  /** The move range it covers. */
  label: string
  /** Moves observed in this phase, across games that carry clock readings. */
  moves: number
  /** Games that lasted long enough to reach this phase. */
  gamesReaching: number
  /** That count as a share of every game in the slice. */
  reachShare: number
  /** Games whose last move fell in this phase. */
  endedHere: number
  /** Analysed games that reached this phase — the denominator for the mistake rates. */
  analysedReaching: number
  /** Your blunders and mistakes played in this phase. */
  blunders: number
  mistakes: number
  /** Blunders per analysed game that reached here. */
  blundersPerGame: number | null
  /**
   * Median clock left on entering the phase, as a share of the control's starting time.
   * Normalized because 3+2 and 15+10 arrive at move 16 with very different absolutes;
   * it can exceed 100% when the increment has outpaced the time spent.
   */
  medianEnteringPct: number | null
  /** Results of the games that ended here. */
  stats: StatBlock
  /** Games whose single slowest move landed here. */
  slowestCount: number
  /** That count as a share of games with a measurable slowest move. */
  slowestShare: number
  medianPerMove: number | null
  /** Share of all the time spent in the slice that went here. */
  clockShare: number
}

/**
 * Where thinking time goes by phase of the game, and where the single slowest think
 * of each game lands. Scoped by whatever filters are active, so picking an opening
 * answers "which middlegames cost me time".
 */
export function computePhases(
  games: GameRecord[],
  config: AnalysisSettings = settings(),
): PhaseBucket[] {
  const usages = games
    .map(clockUsage)
    .filter((usage): usage is ClockUsage => usage !== null)

  const total = usages.reduce(
    (sum, usage) => sum + usage.spent.reduce((inner, seconds) => inner + seconds, 0),
    0,
  )

  const slowestAt = usages.map(usage => usage.spent.indexOf(usage.slowestMove) + 1)

  // reach and result counts use every game; only the timing medians need clock data
  const lengths = games.map(game => ({ game, moves: userMoveCount(game) }))
  const analysed = games.filter(game => game.analysis)

  return gamePhases(config).map(phase => {
    const seconds: number[] = []
    for (const usage of usages) {
      for (let move = phase.from; move <= Math.min(phase.to, usage.spent.length); move++) {
        seconds.push(usage.spent[move - 1])
      }
    }

    const slowestCount = slowestAt.filter(move => move >= phase.from && move <= phase.to).length
    const spentHere = seconds.reduce((sum, value) => sum + value, 0)
    const gamesReaching = lengths.filter(entry => entry.moves >= phase.from).length

    const analysedReaching = analysed.filter(
      game => userMoveCount(game) >= phase.from,
    ).length

    let blunders = 0
    let mistakes = 0
    for (const game of analysed) {
      for (const move of game.analysis?.moves ?? []) {
        if (move.moveNumber < phase.from || move.moveNumber > phase.to) continue
        if (move.tag === '??') blunders++
        else if (move.tag === '?') mistakes++
      }
    }

    const enteringPct: number[] = []
    for (const usage of usages) {
      if (usage.spent.length < phase.from) continue

      // the clock as it stood before their first move of this phase
      const left = phase.from === 1 ? usage.base : usage.remaining[phase.from - 2]
      if (left !== undefined && usage.base > 0) {
        enteringPct.push(Math.round((left / usage.base) * 1000) / 10)
      }
    }
    const endedHere = lengths.filter(
      entry => entry.moves >= phase.from && entry.moves <= phase.to,
    )

    return {
      name: phase.name,
      label: phase.label,
      moves: seconds.length,
      gamesReaching,
      reachShare: games.length === 0 ? 0 : Math.round((gamesReaching / games.length) * 1000) / 10,
      endedHere: endedHere.length,
      analysedReaching,
      blunders,
      mistakes,
      blundersPerGame:
        analysedReaching === 0 ? null : Math.round((blunders / analysedReaching) * 100) / 100,
      medianEnteringPct: enteringPct.length > 0 ? median(enteringPct) : null,
      stats: computeStats(endedHere.map(entry => entry.game)),
      slowestCount,
      slowestShare: slowestAt.length === 0 ? 0 : Math.round((slowestCount / slowestAt.length) * 1000) / 10,
      medianPerMove: seconds.length > 0 ? median(seconds) : null,
      clockShare: total === 0 ? 0 : Math.round((spentHere / total) * 1000) / 10,
    }
  })
}

export interface ClockStats {
  /** Games in the slice that carry clock data. */
  games: number
  /** Games lost on time. */
  timeouts: number
  /** Timeouts as a share of every game in the slice, clocks or not. */
  timeoutPctOfGames: number
  /** Timeouts as a share of losses. */
  timeoutPctOfLosses: number
  medianTimeLeft: number | null
  medianPerMove: number | null
  medianOpeningShare: number | null
}

/**
 * The clock KPI for a slice of games. Timeout rates use every game — the termination is
 * recorded even when clock readings are missing — while the timing medians only use
 * games that actually carry clocks.
 */
export function computeClockStats(games: GameRecord[]): ClockStats {
  const losses = games.filter(game => game.result === 'loss')
  const timeouts = losses.filter(isFlagged).length

  const usages = games
    .map(clockUsage)
    .filter((usage): usage is ClockUsage => usage !== null)

  const pct = (part: number, whole: number) =>
    whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10

  return {
    games: usages.length,
    timeouts,
    timeoutPctOfGames: pct(timeouts, games.length),
    timeoutPctOfLosses: pct(timeouts, losses.length),
    medianTimeLeft: usages.length > 0 ? median(usages.map(u => u.timeLeft)) : null,
    medianPerMove: usages.length > 0 ? median(usages.map(u => u.medianPerMove)) : null,
    medianOpeningShare: usages.length > 0 ? median(usages.map(u => u.openingShare)) : null,
  }
}
