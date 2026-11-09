import { MATE_SCORE } from './engine-protocol'
import { settings, type AnalysisSettings } from './settings'

/**
 * Where a position stands, and what it means to fall out of it.
 *
 * This is the bottom of the analysis: the classifier reads it to grade a move, and the
 * second pass reads it to decide which candidates held. It lives apart from both so they
 * can share it without importing each other.
 *
 * ```
 *   mate      a forced mate against you - the floor, nothing is below it
 *   losing   <= -winning
 *   worse     -winning .. -level
 *   level        -level .. +level
 *   better       +level .. +winning
 *   winning   >= +winning
 * ```
 *
 * `mate` is not a setting: an evaluation that deep is the engine reporting a forced mate
 * rather than counting material, and there is no band under it to fall into.
 */
export type Standing = 'mate' | 'losing' | 'worse' | 'level' | 'better' | 'winning'

/** Worst first, so two standings can be compared and a fall can be measured. */
export const STANDINGS: Standing[] = ['mate', 'losing', 'worse', 'level', 'better', 'winning']

/** Past this the engine is counting moves to mate, not material. */
const MATED = MATE_SCORE / 2

/** Only the two cuts are needed, so a caller holding a subset can ask. */
export type Bands = Pick<AnalysisSettings, 'level' | 'winning'>

export function standingOf(cp: number, config: Bands = settings()): Standing {
  if (cp <= -MATED) return 'mate'
  if (cp >= config.winning) return 'winning'
  if (cp > config.level) return 'better'
  if (cp >= -config.level) return 'level'
  if (cp > -config.winning) return 'worse'
  return 'losing'
}

export const STANDING_LABEL: Record<Standing, string> = {
  winning: 'winning',
  better: 'better',
  level: 'level',
  worse: 'worse',
  losing: 'losing',
  mate: 'mated',
}

/**
 * How bad a move was, read off the fall rather than off the centipawns.
 *
 * This is the whole point of the rewrite. Grading by centipawn loss asks "how much did
 * this cost" when the question is "what did it cost you" — and from a won position those
 * are different questions. Simplifying from +9 to +3.5 gives away five pawns of
 * evaluation and changes nothing about the game; it was being marked as a blunder, which
 * made the winning band the noisiest row in the table and most of it noise.
 *
 * So: staying in your band is an inaccuracy whatever it cost, falling out of it is a
 * mistake, and falling further is a blunder.
 */
export type Severity = 'inaccuracy' | 'mistake' | 'blunder'

/**
 * How much room the position gave you, read off how many of the engine's candidates held.
 *
 * Three buckets rather than two. "A line or a choice" was too coarse at the top: holding
 * on three of five moves is a position with room in it, and holding on all five is a
 * position that forgave anything — and failing those two is not the same failure.
 *
 *   sharp    one or two held, so there was a line to find
 *   tight    a few held, so there was room but not much
 *   stable   everything looked at held, so anything reasonable would have done
 *
 * `tight` rather than `open`: an open position is a real and different thing, and these
 * need not be one. It also sits beside `sharp` as a word about how much the position
 * allows, which is the axis.
 */
export type Breadth = 'sharp' | 'tight' | 'stable'

export const BREADTHS: Breadth[] = ['sharp', 'tight', 'stable']

/**
 * How many candidates holding falls in each bucket, in words.
 *
 * `narrow` and `lines` are two numbers whose whole meaning is the three buckets they cut
 * the search into, and the only place that said so was a column heading in the table at
 * the bottom of the settings screen — a long way from the two boxes that set it. One
 * function now, read by that heading and by the strip under the boxes, so the screen
 * that sets the rule shows what the rule produces and the two cannot drift.
 *
 * `stable` is "all of them" rather than a number because the rule is measured against
 * what the search actually *looked at*: three legal moves with three holding forgave
 * everything, whatever `lines` was asked for.
 */
export function breadthSpan(breadth: Breadth, config = settings()): string {
  if (breadth === 'sharp') return `${config.narrow} or fewer held`
  if (breadth === 'stable') return 'all of them held'
  return config.narrow + 1 > config.lines - 1
    ? 'nothing in between'
    : `${config.narrow + 1} to ${config.lines - 1}`
}

export const BREADTH_LABEL: Record<Breadth, string> = {
  sharp: 'sharp',
  tight: 'tight',
  stable: 'stable',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  inaccuracy: 'inaccuracy',
  mistake: 'mistake',
  blunder: 'blunder',
}

/** The symbols, unchanged, so a stored tag and an exported PGN still read the same. */
export const SEVERITY_MARK: Record<Severity, string> = {
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

export interface Fall {
  from: Standing
  /** Every landing this row covers. */
  to: Standing[]
  severity: Severity
  /**
   * The account field that grades this row instead, where it is a matter of taste.
   *
   * One cell has ever been one: `winning -> better` is a one-band fall the table softens
   * to an inaccuracy on the grounds that you were on top and still are. That is an
   * opinion, and an opinion belongs on the user document — so the row says which switch
   * decides it rather than the grader carrying an `if` about it.
   */
  setting?: keyof Slips
  sharp: string
  tight: string
  stable: string
}

/**
 * Every fall, what it costs you, and what it is called.
 *
 * Two falls are graded softer than their distance suggests, and both earn it at an end of
 * the scale where the band has no floor or ceiling to measure against. `winning -> better`
 * is the only one-band fall that does not change what the position is for: you were on
 * top and you are still on top. `losing -> mated` is the mirror — a position already lost
 * has no better move to point at, and marking the move that ends it would be blaming you
 * for that one rather than for the twenty before it. Everywhere else a band is a band.
 *
 * Every landing has its own row. `winning` and `better` used to merge `worse` with
 * `losing`, on the stated grounds that falling from winning to worse and to losing is the
 * same mistake twice over — which `level` never believed, since it has always had a row
 * for each. It is not true. A move taking you from better to worse costs a median of
 * 342cp in this data and one taking you from better to *losing* costs 650cp, and both
 * were called `missed the follow-up`, as was the one-band fall to level at 161cp. One
 * name covered a slip worth a pawn and a half and a collapse worth ten.
 *
 * That was the `sharp` column's doing more than the merge's: it named the failure ("there
 * was a line and I missed it") and said nothing about where the miss left you, so it read
 * the same from `winning -> level` as from `winning -> losing`. The landings that end the
 * game now say so — `lost it in one` where a playable game became a lost one in a single
 * move, and `lost a won game` where what was lost was already won.
 */
export const TRANSITIONS: Fall[] = [
  { from: 'winning', to: ['winning'], severity: 'inaccuracy', sharp: 'missed-the-kill', tight: 'slowed-it-down', stable: 'let-the-win-go' },
  { from: 'winning', to: ['better'], severity: 'inaccuracy', setting: 'winningSlip', sharp: 'missed-the-kill', tight: 'slowed-it-down', stable: 'let-the-win-go' },
  { from: 'winning', to: ['level'], severity: 'blunder', sharp: 'lost-the-thread', tight: 'let-it-slip', stable: 'threw-it' },
  { from: 'winning', to: ['worse'], severity: 'blunder', sharp: 'lost-the-thread', tight: 'turned-it-around', stable: 'threw-it-away' },
  { from: 'winning', to: ['losing'], severity: 'blunder', sharp: 'lost-a-won-game', tight: 'lost-a-won-game', stable: 'handed-over-a-won-game' },
  { from: 'winning', to: ['mate'], severity: 'blunder', sharp: 'walked-into-mate', tight: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'better', to: ['winning', 'better'], severity: 'inaccuracy', sharp: 'missed-the-sharpest', tight: 'took-the-slow-road', stable: 'eased-off' },
  { from: 'better', to: ['level'], severity: 'mistake', sharp: 'missed-the-follow-up', tight: 'mishandled-the-edge', stable: 'let-the-edge-go' },
  { from: 'better', to: ['worse'], severity: 'blunder', sharp: 'missed-the-follow-up', tight: 'lost-the-plot', stable: 'gave-it-away' },
  { from: 'better', to: ['losing'], severity: 'blunder', sharp: 'lost-it-in-one', tight: 'lost-it-in-one', stable: 'gave-the-game-away' },
  { from: 'better', to: ['mate'], severity: 'blunder', sharp: 'walked-into-mate', tight: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'level', to: ['winning', 'better', 'level'], severity: 'inaccuracy', sharp: 'missed-a-chance', tight: 'drifted', stable: 'a-loose-move' },
  { from: 'level', to: ['worse'], severity: 'mistake', sharp: 'missed-the-line', tight: 'went-the-wrong-way', stable: 'careless' },
  { from: 'level', to: ['losing'], severity: 'blunder', sharp: 'lost-it-in-one', tight: 'came-apart', stable: 'gave-the-game-away' },
  { from: 'level', to: ['mate'], severity: 'blunder', sharp: 'walked-into-mate', tight: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'worse', to: ['winning', 'better', 'level', 'worse'], severity: 'inaccuracy', sharp: 'missed-the-defence', tight: 'defended-badly', stable: 'made-it-worse' },
  { from: 'worse', to: ['losing'], severity: 'mistake', sharp: 'missed-the-defence', tight: 'cracked', stable: 'let-it-go' },
  { from: 'worse', to: ['mate'], severity: 'blunder', sharp: 'walked-into-mate', tight: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'losing', to: ['winning', 'better', 'level', 'worse', 'losing'], severity: 'inaccuracy', sharp: 'missed-the-save', tight: 'hung-on-badly', stable: 'already-lost' },
  // the one fall into mate that is not a blunder: from a position already lost there is
  // nothing to point at instead, and calling it an error would be blaming you for the
  // move rather than for the twenty before it
  { from: 'losing', to: ['mate'], severity: 'inaccuracy', sharp: 'walked-into-mate', tight: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'mate', to: ['winning', 'better', 'level', 'worse', 'losing', 'mate'], severity: 'inaccuracy', sharp: 'already-lost', tight: 'already-lost', stable: 'already-lost' },
]

/**
 * A row's severity as this account grades it.
 *
 * `setting` names the account field that overrides the row, so the override lives in the
 * table with everything else rather than as an `if` beside it — and a second switchable
 * cell is a second marker rather than a second special case.
 */
function graded(fall: Fall, config: Slips): Severity {
  return fall.setting ? config[fall.setting] : fall.severity
}

/** The table as this account grades it, for the screen that draws it. */
export function transitions(config: Slips = settings()): Fall[] {
  return TRANSITIONS.map(fall =>
    fall.setting ? { ...fall, severity: graded(fall, config) } : fall,
  )
}

export function fallBetween(from: Standing, to: Standing): Fall {
  return (
    TRANSITIONS.find(entry => entry.from === from && entry.to.includes(to)) ??
    TRANSITIONS[TRANSITIONS.length - 1]
  )
}

/** What a fall costs, which is now the only thing that grades a move. */
export function severityOf(from: Standing, to: Standing, config: Slips = settings()): Severity {
  return graded(fallBetween(from, to), config)
}

/** The cells of the table the account decides for itself. */
export type Slips = Pick<AnalysisSettings, 'winningSlip'>

/** What the grader needs off the account. */
export type Grading = Bands & Slips & { mistake: number }

/**
 * What a move cost, or null when it cost too little to be worth saying.
 *
 * The one function. `classifyMove` turns it into a mark and the second pass turns it into
 * whether a candidate held, so the rule that grades the move you played and the rule that
 * counts the alternatives are not two rules that have to be kept in step — they are the
 * same call read two ways.
 *
 * The threshold has to be part of it, and that is what the first attempt missed. A band
 * boundary is a line in the sand: +1.01 to +0.99 crosses from better to level and costs
 * two centipawns. Grading that as a mistake would be grading jitter, and counting it as a
 * candidate that failed to hold would be the same jitter wearing the other hat.
 */
export function gradeOf(
  cpBefore: number,
  cpAfter: number,
  config: Grading,
): Severity | null {
  if (cpBefore - cpAfter <= config.mistake) return null
  return severityOf(standingOf(cpBefore, config), standingOf(cpAfter, config), config)
}

/** Whether a move keeps you where you were: it cost nothing, or no more than an inaccuracy. */
export function holdsMove(cpBefore: number, cpAfter: number, config: Grading): boolean {
  const grade = gradeOf(cpBefore, cpAfter, config)
  return grade === null || grade === 'inaccuracy'
}

/** The same question about a fall alone, for the table that names them. */
export function holds(from: Standing, to: Standing): boolean {
  return severityOf(from, to) === 'inaccuracy'
}
