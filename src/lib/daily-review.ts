/**
 * The other half of the move loop: a finished game read against the engine, with every
 * disagreement filed under the step that should have caught it.
 *
 * **It runs no engine.** The daily game is brought in as an ordinary game document
 * (`uploadFrom`), the existing first pass analyses it one game at a time the way it
 * analyses any other, and this module is a join: `analysis.moves` carries `cpBefore`
 * and `cpAfter` for each of your moves, keyed by the absolute ply — which is exactly
 * what a `MoveLog` is keyed by. So the post-mortem costs a read, and a second engine
 * here would have been a second answer to what a position is worth.
 *
 * Two different findings come out of it, and they are different because the log records
 * two different things:
 *
 * - **the move** — the engine marked it, so some step of the loop missed something;
 * - **the read** — your evaluation of the position landed in a different band from the
 *   engine's, so whatever you played, you did not know where you stood.
 *
 * The second is the one nothing else in this app could ever have told you, and it is
 * why the estimate is written on every move rather than only the quiet ones.
 */
import { standingOf, type Standing } from './bands'
import { blamesAStep, FAILURE_IDS, FAILURE_LABEL, yourPlies } from './daily'
import { isFault } from './review'
import type { DailyGame, GameRecord, MoveFailureId, MoveLog } from '@/types/chess'

/**
 * Your estimate in the frame the stored analysis uses.
 *
 * The log holds White's frame, because that is what every board and engine reading on
 * screen shows and a number you type should be in the units you read. Everything
 * *stored* by the analysis layer is in your own frame, and so is every rule that reads
 * it — `standingOf` asks where **you** stood. So the conversion happens here, once, on
 * the way into the comparison.
 */
export function guessInYourFrame(evaluation: number, color: DailyGame['color']): number {
  return Math.round((color === 'white' ? evaluation : -evaluation) * 100)
}

export interface ReviewRow {
  /** Index into the game's move list. */
  ply: number
  /** Your move, or null for a move not played yet. */
  san: string | null
  moveNumber: number
  log: MoveLog | null
  /** Your estimate, in your own frame, or null where you wrote none. */
  guess: number | null
  /** The engine on the position before your move, your frame. */
  cpBefore: number | null
  cpAfter: number | null
  /** How far out your estimate was, in centipawns. */
  error: number | null
  band: Standing | null
  guessedBand: Standing | null
  /** The mark the engine put on the move, or null where it put none you show. */
  mark: string | null
  /**
   * Whether this move is waiting to be filed.
   *
   * The engine marked it, or your read of the position was out by a whole band. A move
   * that was fine *and* correctly judged has nothing to explain, which is most of them —
   * and a post-mortem that listed every move would bury the three that matter.
   */
  wants: boolean
}

/**
 * Your moves, joined to what the engine made of them.
 *
 * Every move of yours that was played gets a row, whether or not you wrote the loop
 * down for it: a move you skipped is itself a finding, and a row with nothing on either
 * side is how you see that you stopped writing on move 23.
 *
 * `band` is compared rather than the raw centipawns, because a band is the app's own
 * vocabulary for where you stand and a centipawn threshold here would be a second,
 * private answer to what counts as a different position. Being 60cp out inside `level`
 * is a good read; being 60cp out across the edge of it is not, and only the band says
 * which happened.
 */
export function reviewRows(game: DailyGame, analysis?: GameRecord['analysis']): ReviewRow[] {
  const byPly = new Map((analysis?.moves ?? []).map(move => [move.ply, move]))

  return yourPlies(game, game.moves.length - 1).map(ply => {
    const log = game.logs[String(ply)] ?? null
    const move = byPly.get(ply) ?? null

    const guess =
      log && log.evaluation !== null ? guessInYourFrame(log.evaluation, game.color) : null
    const cpBefore = move ? move.cpBefore : null

    const band = cpBefore === null ? null : standingOf(cpBefore)
    const guessedBand = guess === null ? null : standingOf(guess)
    const mark = move && isFault(move.tag) ? move.tag : null

    return {
      ply,
      san: game.moves[ply] ?? null,
      moveNumber: Math.floor(ply / 2) + 1,
      log,
      guess,
      cpBefore,
      cpAfter: move ? move.cpAfter : null,
      error: guess !== null && cpBefore !== null ? Math.abs(guess - cpBefore) : null,
      band,
      guessedBand,
      mark,
      wants: mark !== null || (band !== null && guessedBand !== null && band !== guessedBand),
    }
  })
}

export interface Calibration {
  /** Rows the engine has a reading for. */
  read: number
  /** How many of those you wrote an estimate on. */
  guessed: number
  /** Mean absolute error in centipawns, over the ones you guessed. */
  meanError: number | null
  /** How many landed in the engine's own band. */
  rightBand: number
}

function calibrate(rows: ReviewRow[]): Calibration {
  const read = rows.filter(row => row.cpBefore !== null).length
  const scored = rows.filter(row => row.error !== null)
  const total = scored.reduce((sum, row) => sum + (row.error ?? 0), 0)

  return {
    read,
    guessed: scored.length,
    meanError: scored.length > 0 ? Math.round(total / scored.length) : null,
    rightBand: scored.filter(row => row.band === row.guessedBand).length,
  }
}

export interface CalibrationSplit {
  all: Calibration
  /** Moves where the burger found something concrete. */
  concrete: Calibration
  /** Moves you called quiet, which is the harder estimate and the one worth watching. */
  quiet: Calibration
}

/**
 * How well you read the position, split by the gate.
 *
 * The split is the interesting one rather than a decoration: a move where you found a
 * tactic is a move whose evaluation you calculated, and a move you called quiet is one
 * you *judged*. Those are the two skills the loop separates, so reporting one average
 * over both would hide whichever of them is the problem.
 */
export function calibration(rows: ReviewRow[]): CalibrationSplit {
  return {
    all: calibrate(rows),
    concrete: calibrate(rows.filter(row => row.log?.concrete === true)),
    quiet: calibrate(rows.filter(row => row.log?.concrete === false)),
  }
}

export interface FailureCount {
  id: MoveFailureId
  label: string
  count: number
}

/**
 * Which steps are failing, most first.
 *
 * `none` is counted separately and never as a step, the rule the review form's "hard to
 * find" established: a move nothing in the loop would have caught is not evidence
 * against a step, and letting it into the table would inflate whichever row happened to
 * be selected for it.
 */
export function failureTally(logs: MoveLog[]): {
  rows: FailureCount[]
  /** Moves filed as nothing the loop would have caught. */
  unavoidable: number
  /** Moves the engine marked that nobody has filed yet. */
  filed: number
} {
  const counts = new Map<MoveFailureId, number>()
  for (const log of logs) {
    if (!blamesAStep(log.failed)) continue
    counts.set(log.failed!, (counts.get(log.failed!) ?? 0) + 1)
  }

  const rows = FAILURE_IDS.filter(id => (counts.get(id) ?? 0) > 0)
    .map(id => ({ id, label: FAILURE_LABEL[id], count: counts.get(id) ?? 0 }))
    .sort((a, b) => b.count - a.count)

  return {
    rows,
    unavoidable: logs.filter(log => log.failed === 'none').length,
    filed: logs.filter(log => log.failed !== undefined).length,
  }
}

/** Every log of every game, for a tally that spans more than one. */
export function allLogs(games: DailyGame[]): MoveLog[] {
  return games.flatMap(game => Object.values(game.logs))
}
