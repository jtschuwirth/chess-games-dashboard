/**
 * The numbers the analysis is a judgement about, kept in one place and set per account.
 *
 * Every one of these started as a constant in the file that used it, and every one of
 * them moved at least once: two pawns became three for a decided position, one move
 * became two for a concrete line, level narrowed to a pawn either way. Each move meant a
 * code change for a number that is a matter of taste — so they live on the account now,
 * and the screen that explains what they do is the screen that sets them.
 *
 * They are only ever read, never stored into a result: `normalizeAnalysis` and
 * `verdictsOf` re-derive every mark and verdict as the games are read, so changing one
 * of these re-reads your whole history without an engine running.
 */

/** Repeated here rather than imported: `bands.ts` reads the settings, not the other way. */
export type Severity = 'inaccuracy' | 'mistake' | 'blunder'

export const SEVERITIES: Severity[] = ['inaccuracy', 'mistake', 'blunder']

export interface AnalysisSettings {
  /** Within this many centipawns of even, the position is level. */
  level: number
  /** From this many centipawns the position is won — and below its negative, lost. */
  winning: number
  /** At most this many candidate moves holding makes a position concrete. */
  narrow: number
  /** How many candidate moves the second pass asks the engine for. */
  lines: number
  /**
   * Centipawn loss below which a move is not worth marking at all.
   *
   * The only thing centipawns decide any more. How bad a marked move is comes from the
   * band it fell out of — see `lib/bands.ts` — because "how much did this cost" and "what
   * did it cost you" are different questions, and from a won position they have very
   * different answers.
   */
  mistake: number
  /** Which marks to count as faults. The rest are recorded and left off the screen. */
  marks: Severity[]
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  level: 100,
  winning: 300,
  narrow: 2,
  lines: 5,
  mistake: 100,
  // an inaccuracy is by definition a move the position excused; it is recorded, not shown
  marks: ['mistake', 'blunder'],
}

/** What each one may be set to. A number outside its range would read as a broken app. */
export const NUMBERS = ['level', 'winning', 'narrow', 'lines', 'mistake'] as const

export type NumberSetting = (typeof NUMBERS)[number]

export const SETTING_RANGE: Record<NumberSetting, { min: number; max: number }> = {
  level: { min: 10, max: 300 },
  winning: { min: 100, max: 1500 },
  narrow: { min: 1, max: 8 },
  lines: { min: 2, max: 8 },
  mistake: { min: 20, max: 500 },
}

function clamp(value: unknown, key: NumberSetting): number {
  const { min, max } = SETTING_RANGE[key]
  const number = Math.round(Number(value))
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS[key]
  return Math.max(min, Math.min(number, max))
}

/**
 * A stored settings object in the shape the code expects, whatever is in the document.
 *
 * Also keeps the two pairs in order: a level band wider than the winning one would make
 * `better` an empty band, and a mistake threshold above the blunder one would mean no
 * move could ever be a mistake without being a blunder.
 */
export function normalizeSettings(raw: Partial<AnalysisSettings> | undefined): AnalysisSettings {
  const next: AnalysisSettings = { ...DEFAULT_SETTINGS }

  if (raw) {
    for (const key of NUMBERS) {
      if (raw[key] !== undefined) next[key] = clamp(raw[key], key)
    }

    if (Array.isArray(raw.marks)) {
      const kept = SEVERITIES.filter(severity => raw.marks?.includes(severity))
      // nothing marked is a screen with nothing on it, which is never what was meant
      if (kept.length > 0) next.marks = kept
    }
  }

  // a level band wider than the winning one would leave `better` with nothing in it
  next.winning = Math.max(next.winning, next.level + 1)
  return next
}

/**
 * The settings in force, for the pure functions that would otherwise each need them
 * threaded through from the page that loaded them.
 *
 * The same shape as the engine mode toggle: a module value, set once when the account's
 * games are read, with every function that uses it taking an explicit argument that
 * defaults to this. A caller that has the settings in hand passes them; one that does not
 * gets the account's, or the defaults before anything has loaded.
 */
let current: AnalysisSettings = DEFAULT_SETTINGS

export function settings(): AnalysisSettings {
  return current
}

export function applySettings(next: AnalysisSettings): void {
  current = next
}
