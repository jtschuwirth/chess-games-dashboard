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

export interface AnalysisSettings {
  /** Within this many centipawns of even, the position is level. */
  level: number
  /** From this many centipawns the position is won — and below its negative, lost. */
  winning: number
  /** At most this many candidate moves holding makes a position concrete. */
  narrow: number
  /** How many candidate moves the second pass asks the engine for. */
  lines: number
  /** Centipawn loss above which a move is a mistake. */
  mistake: number
  /** Centipawn loss above which a move is a blunder. */
  blunder: number
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  level: 100,
  winning: 300,
  narrow: 2,
  lines: 5,
  mistake: 100,
  blunder: 300,
}

/** What each one may be set to. A number outside its range would read as a broken app. */
export const SETTING_RANGE: Record<keyof AnalysisSettings, { min: number; max: number }> = {
  level: { min: 10, max: 300 },
  winning: { min: 100, max: 1500 },
  narrow: { min: 1, max: 8 },
  lines: { min: 2, max: 8 },
  mistake: { min: 20, max: 500 },
  blunder: { min: 50, max: 1500 },
}

function clamp(value: unknown, key: keyof AnalysisSettings): number {
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
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AnalysisSettings)[]) {
      if (raw[key] !== undefined) next[key] = clamp(raw[key], key)
    }
  }

  next.winning = Math.max(next.winning, next.level + 1)
  next.blunder = Math.max(next.blunder, next.mistake + 1)
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
