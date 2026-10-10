/**
 * The shape of a whole game, read off the evaluations the first pass already stored.
 *
 * A move has a descriptor — what kind of mistake it was. A game does not, and the result
 * is a poor substitute: a win can be a forty-move squeeze or a gift on move nine, and
 * those are not the same evening. What distinguishes them is the eval graph, and the
 * graph is already on disk.
 *
 * Everything here is derived. `analysis.moves` holds `cpBefore` and `cpAfter` for every
 * move of yours, so the two of them laid end to end are the evaluation at every half-move
 * the game passed through — your move's effect and then your opponent's reply, alternating,
 * all in your frame. No new field, no re-run, and it works on every analysed game at the
 * current version the moment it is read.
 */
import { ACCURACY_CAP } from './accuracy'
import { standingOf, type Standing } from './bands'
import { gamePhases, type GamePhase } from './clocks'
import { settings } from './settings'
import { endingOf, type Ending } from './termination'
import type { GameRecord, GameResult } from '@/types/chess'

/**
 * The evaluation at every half-move, in your frame, clamped.
 *
 * Clamped for the same reason the accuracy figure is: a forced mate scores 10000, and one
 * of them would otherwise be the whole of a game's measured movement. ±1000 is a decisive
 * position by any reading, and squeezing both ends into it also makes "it got worse while
 * already lost" cost nothing, which is what the rest of the app believes.
 */
export function evalSeries(game: GameRecord): number[] {
  const moves = game.analysis?.moves ?? []
  if (moves.length === 0) return []

  const clamp = (cp: number) => Math.max(-ACCURACY_CAP, Math.min(ACCURACY_CAP, cp))
  const points: number[] = []

  for (const move of moves) {
    points.push(clamp(move.cpBefore), clamp(move.cpAfter))
  }

  return points
}

export interface GameShape {
  /** Half-move evaluations, in your frame. Two per move of yours. */
  points: number[]
  /** The best you ever stood, and the worst. */
  peak: number
  trough: number
  /** Where it finished, which is not the result: you can be winning and flag. */
  end: number
  /**
   * How far the evaluation travelled in all, counting every step up and down.
   *
   * This is the one number that separates a quiet game from a wild one, and it is
   * deliberately not the same as `peak - trough`: a game that walks to +3 and back twice
   * travels twice as far as one that walks there once, and reads nothing alike.
   */
  travel: number
  /** The largest single half-move step, and where in the game it happened (0..1). */
  jolt: number
  joltAt: number
  /**
   * How many times the lead changed hands — crossed from outside the level band on one
   * side to outside it on the other. Drifting in and out of level is not a change of
   * lead, which is why this counts crossings between the bands rather than of zero.
   */
  swings: number
  /** Share of the half-moves spent inside the level band. */
  levelShare: number
  /**
   * How far into the game the evaluation last entered the band it finished in, 0..1.
   *
   * Low is a game decided early and then played out; high is one decided at the death.
   * Null when the game never settles, which only happens when it ends on its first point.
   */
  settledAt: number | null
  /**
   * The same moment as an index into `points`, kept beside the share of it.
   *
   * The share is for drawing; this is for saying which of your moves it was, and a
   * move number recovered by multiplying a rounded fraction back out is a move number
   * that is sometimes off by one.
   */
  settledIndex: number | null
}

export function shapeOf(game: GameRecord, config = settings()): GameShape | null {
  const points = evalSeries(game)
  if (points.length < 2) return null

  const level = config.level
  let travel = 0
  let jolt = 0
  let joltIndex = 0
  let swings = 0
  let inLevel = 0
  // which side of level the game was last clearly on: 1 yours, -1 theirs, 0 neither yet
  let lead = 0

  for (const [index, cp] of points.entries()) {
    if (Math.abs(cp) <= level) inLevel++

    if (cp > level || cp < -level) {
      const side = cp > level ? 1 : -1
      if (lead !== 0 && side !== lead) swings++
      lead = side
    }

    if (index === 0) continue
    const step = Math.abs(cp - points[index - 1])
    travel += step
    if (step > jolt) {
      jolt = step
      joltIndex = index
    }
  }

  const end = points[points.length - 1]
  const finalBand = standingOf(end, config)

  /*
    Walked backwards from the end: the first point whose band differs from the final one
    is the last moment the game was something else. A game that was never anything else
    settled at the start, which is what 0 means here.
  */
  let settled = 0
  for (let index = points.length - 1; index >= 0; index--) {
    if (standingOf(points[index], config) !== finalBand) {
      settled = index + 1
      break
    }
  }

  return {
    points,
    peak: Math.max(...points),
    trough: Math.min(...points),
    end,
    travel,
    jolt,
    joltAt: joltIndex / (points.length - 1),
    swings,
    levelShare: inLevel / points.length,
    settledAt: points.length < 2 ? null : settled / (points.length - 1),
    settledIndex: points.length < 2 ? null : settled,
  }
}

/**
 * Which phase of the game decided it.
 *
 * `settledIndex` is the last moment the game was in a different band from the one it
 * finished in — which is the moment every arc is named after, whichever arc it is. A
 * game you recovered settled when you stopped losing; one you threw settled when you
 * stopped winning; one you never had settled when it went. So the phase holding that
 * point is the phase the game turned in, and no separate rule per arc is needed.
 *
 * `evalSeries` puts two points on each of your moves — before it and after it — so a
 * point index halves into a move number, which is what the phases count in.
 */
export function decidedIn(shape: GameShape, config = settings()): GamePhase | null {
  if (shape.settledIndex === null) return null

  const move = Math.floor(shape.settledIndex / 2) + 1
  return gamePhases(config).find(phase => move >= phase.from && move <= phase.to) ?? null
}

/**
 * How each arc reads with a phase after it.
 *
 * `ARC_LABEL` cannot simply take "in the …" — "never had it in the opening" says the
 * wrong thing, and "shared in the endgame" says nothing. These are the same five
 * arcs told as what happened rather than as what became of the lead.
 */
export const DECIDED_IN: Record<Arc, string> = {
  held: 'took it in',
  recovered: 'recovered in',
  threw: 'threw it in',
  'never-had-it': 'lost it in',
  shared: 'levelled out in',
}

/**
 * "recovered in the tactical / strategic duel" — the arc and where it happened.
 *
 * It reads as well as you have named your phases, which is the point of their being
 * yours: call that stretch the middlegame and this says "recovered in the
 * middlegame". Null on a game with no turning point to name.
 */
export function decidedPhrase(telling: GameTelling, config = settings()): string | null {
  const phase = decidedIn(telling.shape, config)
  if (!phase) return null
  return `${DECIDED_IN[telling.arc]} the ${phase.name.toLowerCase()}`
}

/** The three standings a shape is read through, for anything that wants to name it. */
export function standingsOf(
  shape: GameShape,
  config = settings(),
): { peak: Standing; trough: Standing; end: Standing } {
  return {
    peak: standingOf(shape.peak, config),
    trough: standingOf(shape.trough, config),
    end: standingOf(shape.end, config),
  }
}

/* ------------------------------------------------------------------ naming a game */

/**
 * What became of the lead, which is the half of a game the result cannot say.
 *
 *   held          you finished ahead and were never lost
 *   recovered     you finished ahead from a position that was lost
 *   threw         you had a won game and finished behind
 *   never-had-it  you finished behind without ever having a won game
 *   shared        it finished level
 */
export type Arc = 'held' | 'recovered' | 'threw' | 'never-had-it' | 'shared'

/**
 * How many times the lead actually changed hands — the other half.
 *
 *   steady   it never did: one side was on top and stayed there
 *   turned   once
 *   traded   twice or more, so both of you had it and gave it back
 */
export type Texture = 'steady' | 'turned' | 'traded'

export const ARCS: Arc[] = ['held', 'recovered', 'threw', 'never-had-it', 'shared']
export const TEXTURES: Texture[] = ['steady', 'turned', 'traded']

export const ARC_LABEL: Record<Arc, string> = {
  held: 'held it',
  recovered: 'recovered',
  threw: 'threw it',
  'never-had-it': 'never had it',
  shared: 'shared',
}

export const TEXTURE_LABEL: Record<Texture, string> = {
  steady: 'steady',
  turned: 'turned once',
  traded: 'traded',
}

/**
 * Coloured by the arc, for the same reason a move's badge is coloured by the band it
 * fell from: it is the axis that says what happened to you. Green kept, red given back.
 */
export const ARC_BADGE: Record<Arc, string> = {
  held: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  recovered: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  threw: 'bg-red-500/15 text-red-300 border-red-500/30',
  'never-had-it': 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  shared: 'bg-zinc-700/30 text-zinc-400 border-zinc-700',
}

/**
 * What each pair is called. Fifteen names, the same shape as `TRANSITIONS` one level up.
 *
 * Two cells cannot happen and are filled anyway: you cannot recover a lost game or give
 * away a won one without the lead changing hands, so `recovered` and `threw` have no
 * `steady` column in life. They are named so that nothing can fall through the table —
 * the same reason the move table carries rows no evaluation reaches.
 *
 * The names deliberately avoid the move descriptors' vocabulary. `threw it`, `lost the
 * thread` and `gave it away` already mean something precise about a single move, and
 * reusing them for a whole game would make a tag table read as though the two were the
 * same kind of thing.
 */
export const GAME_NAMES: Record<Arc, Record<Texture, string>> = {
  held: {
    steady: 'a clean win',
    turned: 'took it over',
    traded: 'won the shootout',
  },
  recovered: {
    steady: 'a rescue',
    turned: 'a rescue',
    traded: 'stole a wild one',
  },
  threw: {
    steady: 'handed it back',
    turned: 'handed it back',
    traded: 'lost a wild one',
  },
  'never-had-it': {
    steady: 'outplayed',
    turned: 'let it get away',
    traded: 'scrapped and lost',
  },
  shared: {
    steady: 'nothing in it',
    turned: 'levelled out',
    traded: 'a wild draw',
  },
}

/** What the final evaluation says the result should have been. */
export function boardSaid(shape: GameShape, config = settings()): GameResult {
  const end = standingOf(shape.end, config)
  if (end === 'winning' || end === 'better') return 'win'
  if (end === 'level') return 'draw'
  return 'loss'
}

/**
 * What became of the lead, decided by the result and coloured in by the graph.
 *
 * The result leads, and it did not at first — the arc read the final evaluation instead,
 * on the reasoning that the graph is the honest story and a game lost on the clock from a
 * won position is still a game you held. That reads as a contradiction on the row it
 * appears on: `stole a wild one` against a loss, `a wild draw` against a win. The result
 * is what the game was actually worth, so it picks the family and the graph says how you
 * got there; where the two disagree, `offBoardOf` names it outright.
 */
export function arcOf(shape: GameShape, result: GameResult, config = settings()): Arc {
  const { peak, trough } = standingsOf(shape, config)

  if (result === 'draw') return 'shared'
  if (result === 'win') return trough === 'losing' || trough === 'mate' ? 'recovered' : 'held'
  return peak === 'winning' ? 'threw' : 'never-had-it'
}

export function textureOf(shape: GameShape): Texture {
  if (shape.swings === 0) return 'steady'
  return shape.swings === 1 ? 'turned' : 'traded'
}

/**
 * How a point went somewhere the board was not sending it.
 *
 * Four per cent of analysed games, and every one of them a flag, a repetition, an
 * abandonment or a resignation. They are the games the graph describes worst: you can be
 * dead lost and win, and no reading of the evaluations will ever say why. The ending will
 * — so where the result and the board disagree, the ending names the game and the arc is
 * left as the supporting figure it deserves to be.
 *
 * Null when the two agree, which is the other 96%.
 */
export interface OffBoard {
  /** The point you actually got. */
  result: GameResult
  /** What the final evaluation was sending your way, from your side. */
  board: GameResult
  /** The endings this row names. Empty is the catch-all for that pair, and comes last. */
  endings: Ending[]
  name: string
}

/**
 * How a point went somewhere the board was not sending it, as a table rather than a
 * cascade — the same reason `TRANSITIONS` is one: the screen that explains a rule should
 * be able to render the rule, not a prose copy of it that drifts.
 *
 * Read top down; the first row matching the result, the board and the ending wins, and a
 * row with no endings catches everything else for that pair. `board` is from your side,
 * so `loss` is a board that was sending the point to *them*.
 */
export const OFF_BOARD: OffBoard[] = [
  { result: 'win', board: 'loss', endings: ['flagged'], name: 'saved by the flag' },
  { result: 'win', board: 'loss', endings: ['resignation'], name: 'they resigned a won game' },
  { result: 'win', board: 'loss', endings: ['abandoned'], name: 'they walked away' },
  { result: 'win', board: 'loss', endings: [], name: 'won it off the board' },

  { result: 'win', board: 'draw', endings: ['flagged'], name: 'won on the clock' },
  { result: 'win', board: 'draw', endings: ['resignation'], name: 'they resigned a draw' },
  { result: 'win', board: 'draw', endings: ['abandoned'], name: 'they walked away' },
  { result: 'win', board: 'draw', endings: [], name: 'won it off the board' },

  { result: 'loss', board: 'win', endings: ['flagged'], name: 'flagged a won game' },
  { result: 'loss', board: 'win', endings: ['resignation'], name: 'resigned a won game' },
  { result: 'loss', board: 'win', endings: ['abandoned'], name: 'walked away from it' },
  { result: 'loss', board: 'win', endings: [], name: 'lost it off the board' },

  { result: 'loss', board: 'draw', endings: ['flagged'], name: 'flagged a level one' },
  { result: 'loss', board: 'draw', endings: ['resignation'], name: 'resigned a level one' },
  { result: 'loss', board: 'draw', endings: ['abandoned'], name: 'walked away from it' },
  { result: 'loss', board: 'draw', endings: [], name: 'lost it off the board' },

  { result: 'draw', board: 'win', endings: [], name: 'drew a won game' },
  { result: 'draw', board: 'loss', endings: [], name: 'escaped with a draw' },
]

export function offBoardOf(game: GameRecord, shape: GameShape, config = settings()): string | null {
  const board = boardSaid(shape, config)
  if (board === game.result) return null

  const ending = endingOf(game)
  const row =
    OFF_BOARD.find(
      entry =>
        entry.result === game.result && entry.board === board && entry.endings.includes(ending),
    ) ??
    OFF_BOARD.find(
      entry => entry.result === game.result && entry.board === board && entry.endings.length === 0,
    )

  return row?.name ?? null
}

/** Every name a game can carry, for a filter that offers them. */
export function gameNames(): { grouped: { arc: Arc; names: string[] }[]; offBoard: string[] } {
  return {
    grouped: ARCS.map(arc => ({
      arc,
      names: [...new Set(TEXTURES.map(texture => GAME_NAMES[arc][texture]))],
    })),
    offBoard: [...new Set(OFF_BOARD.map(row => row.name))],
  }
}

export interface GameTelling {
  arc: Arc
  texture: Texture
  /** The name of the game: the ending where it overrode the board, the pair otherwise. */
  name: string
  /** Set when the point went somewhere the evaluations were not sending it. */
  offBoard: string | null
  shape: GameShape
}

/** What kind of game this was. Null when the engine has not been over it. */
export function tellingOf(game: GameRecord, config = settings()): GameTelling | null {
  const shape = shapeOf(game, config)
  if (!shape) return null

  const arc = arcOf(shape, game.result, config)
  const texture = textureOf(shape)
  const offBoard = offBoardOf(game, shape, config)

  return { arc, texture, offBoard, name: offBoard ?? GAME_NAMES[arc][texture], shape }
}

/** The sentence behind a badge: what became of the lead, and how often it moved. */
export function tellingHint(telling: GameTelling, config = settings()): string {
  const { peak, trough } = standingsOf(telling.shape, config)
  const swings = telling.shape.swings

  const lead =
    swings === 0
      ? 'The lead never changed hands.'
      : `The lead changed hands ${swings === 1 ? 'once' : `${swings} times`}.`

  const board = telling.offBoard
    ? ` The board was not sending the point this way — ${GAME_NAMES[telling.arc][telling.texture]} on the evaluations alone.`
    : ''

  const decided = decidedPhrase(telling, config)
  const where = decided ? ` You ${decided}, ` : ' Settled '

  return (
    `Best you stood: ${peak}. Worst: ${trough}. ${lead}` +
    `${where}with ${Math.round((1 - (telling.shape.settledAt ?? 1)) * 100)}% of the game left.${board}`
  )
}
