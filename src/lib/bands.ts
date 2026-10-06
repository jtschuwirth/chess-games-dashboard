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
  concrete: string
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
 */
export const TRANSITIONS: Fall[] = [
  { from: 'winning', to: ['winning', 'better'], severity: 'inaccuracy', concrete: 'missed-the-kill', stable: 'let-the-win-go' },
  { from: 'winning', to: ['level'], severity: 'blunder', concrete: 'lost-the-thread', stable: 'threw-it' },
  { from: 'winning', to: ['worse', 'losing'], severity: 'blunder', concrete: 'lost-the-thread', stable: 'threw-it-away' },
  { from: 'winning', to: ['mate'], severity: 'blunder', concrete: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'better', to: ['winning', 'better'], severity: 'inaccuracy', concrete: 'missed-the-sharpest', stable: 'eased-off' },
  { from: 'better', to: ['level'], severity: 'mistake', concrete: 'missed-the-follow-up', stable: 'let-the-edge-go' },
  { from: 'better', to: ['worse', 'losing'], severity: 'blunder', concrete: 'missed-the-follow-up', stable: 'gave-it-away' },
  { from: 'better', to: ['mate'], severity: 'blunder', concrete: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'level', to: ['winning', 'better', 'level'], severity: 'inaccuracy', concrete: 'missed-a-chance', stable: 'a-loose-move' },
  { from: 'level', to: ['worse'], severity: 'mistake', concrete: 'missed-the-line', stable: 'careless' },
  { from: 'level', to: ['losing'], severity: 'blunder', concrete: 'missed-the-line', stable: 'gave-it-away' },
  { from: 'level', to: ['mate'], severity: 'blunder', concrete: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'worse', to: ['winning', 'better', 'level', 'worse'], severity: 'inaccuracy', concrete: 'missed-the-defence', stable: 'made-it-worse' },
  { from: 'worse', to: ['losing'], severity: 'mistake', concrete: 'missed-the-defence', stable: 'let-it-go' },
  { from: 'worse', to: ['mate'], severity: 'blunder', concrete: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'losing', to: ['winning', 'better', 'level', 'worse', 'losing'], severity: 'inaccuracy', concrete: 'missed-the-save', stable: 'already-lost' },
  // the one fall into mate that is not a blunder: from a position already lost there is
  // nothing to point at instead, and calling it an error would be blaming you for the
  // move rather than for the twenty before it
  { from: 'losing', to: ['mate'], severity: 'inaccuracy', concrete: 'walked-into-mate', stable: 'walked-into-mate' },

  { from: 'mate', to: ['winning', 'better', 'level', 'worse', 'losing', 'mate'], severity: 'inaccuracy', concrete: 'already-lost', stable: 'already-lost' },
]

export function fallBetween(from: Standing, to: Standing): Fall {
  return (
    TRANSITIONS.find(entry => entry.from === from && entry.to.includes(to)) ??
    TRANSITIONS[TRANSITIONS.length - 1]
  )
}

/** What a fall costs, which is now the only thing that grades a move. */
export function severityOf(from: Standing, to: Standing): Severity {
  return fallBetween(from, to).severity
}

/** What the grader needs off the account. */
export type Grading = Bands & { mistake: number }

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
  return severityOf(standingOf(cpBefore, config), standingOf(cpAfter, config))
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
