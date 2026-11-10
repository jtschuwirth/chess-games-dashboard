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
  /** At most this many candidate moves holding makes a position sharp. */
  narrow: number
  /** How many candidate moves the second pass asks the engine for. */
  lines: number
  /**
   * Centipawn loss below which a move is not worth marking at all.
   *
   * The only thing centipawns decide any more, and it is also what keeps a band edge
   * from being graded instead of a move: +3.2 to +2.9 leaves `winning` for thirty
   * centipawns and is simply not marked. How bad a marked move is comes from the band it
   * fell out of — see `lib/bands.ts` — because "how much did this cost" and "what did it
   * cost you" are different questions, and from a won position they have very different
   * answers.
   */
  mistake: number
  /**
   * The falls you grade differently from the table's own answer.
   *
   * What a fall costs is the last judgement in the analysis that was still a constant,
   * and it is a judgement about your own chess: whether letting a won game become merely
   * better is a slip or a mistake is not a fact about chess, it is what you want to be
   * shown. Every cell of `TRANSITIONS` can be set, and it grades the engine's candidates
   * as well as your own move — one function does both — so raising a cell above an
   * inaccuracy means a candidate landing there stops counting as having held, and the
   * breadth of every marked move is re-read under the stricter rule.
   *
   * **Only the disagreements are stored.** The table is the app's own opinion and it has
   * moved before; an account holding all twenty-one rows would be a frozen copy of an
   * argument it never joined. So an empty list means "whatever the table says", and a cell
   * set back to its own answer is removed rather than written.
   *
   * It is a list rather than a map because a `merge` write replaces an array and merges a
   * map — so a map would keep handing back the override you had just cleared. The same
   * reason the tag vocabulary is a list.
   */
  grades: GradeOverride[]
  /**
   * The one-cell version of `grades`, read forward and never written again.
   *
   * It said what `winning -> better` costs, which was the only cell anyone had argued
   * about out loud. Kept on the type because `normalizeSettings` still reads it off a
   * stored document — the habit a pattern's `main` already follows.
   */
  winningSlip?: Severity
  /** Which marks to count as faults. The rest are recorded and left off the screen. */
  marks: Severity[]
  /** The stretches a game is read in, in your own move numbers. */
  phases: PhaseSetting[]
}

/**
 * One fall, graded as you grade it rather than as the table does.
 *
 * `fall` is the row's own key, `from>to` — see `fallKey` in `lib/bands.ts`, which owns
 * the rule. It is deliberately *not* validated against the table here: `settings.ts` is
 * what `bands.ts` reads, so looking the other way would be a cycle at module load. The
 * split is shape against meaning — this file checks that an entry is a string and a real
 * severity, and a key naming no row simply matches nothing, which is the same thing as
 * not being there.
 */
export interface GradeOverride {
  fall: string
  severity: Severity
}

/**
 * The cell the one-cell version of this setting used to hold.
 *
 * `winningSlip` was a field of its own for exactly one release. It is read forward into
 * `grades` rather than migrated, the habit every stored shape here follows — and cleared
 * on write, because a merge leaves a field nobody writes any more sitting in the
 * document, where it would revive an override you had just cleared.
 */
export const RETIRED_WINNING_SLIP = 'winning>better'

/**
 * One stretch of a game.
 *
 * Only where it *starts* is stored. A phase runs until the next one begins and the
 * last runs to the end, so the thing the old hardcoded table had to be careful about
 * — contiguous, no overlap, no gap; the original sketch had 16-30 and 30+ both
 * containing move 30 — is not something this shape can express wrongly. There is no
 * `to` to disagree with the next `from`.
 *
 * The numbers are your own moves, not plies: move 16 is your sixteenth move whichever
 * colour you had.
 */
export interface PhaseSetting {
  name: string
  /** Your first move of this phase. The first phase always starts at 1. */
  from: number
}

export const DEFAULT_PHASES: PhaseSetting[] = [
  { name: 'Opening setup', from: 1 },
  { name: 'Variation development', from: 5 },
  { name: 'Structure definition', from: 11 },
  { name: 'Tactical / strategic duel', from: 16 },
  { name: 'Pre-endgame', from: 31 },
  { name: 'Endgame', from: 51 },
]

/** Past this a phase table is a wall of rows and the graph has no room to label them. */
export const MAX_PHASES = 8

export const DEFAULT_SETTINGS: AnalysisSettings = {
  level: 100,
  winning: 300,
  narrow: 2,
  lines: 5,
  mistake: 100,
  // nothing disputed: every fall costs what `TRANSITIONS` says it costs
  grades: [],
  // an inaccuracy is by definition a move the position excused; it is recorded, not shown
  marks: ['mistake', 'blunder'],
  phases: DEFAULT_PHASES,
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

    /*
      Read forward, not migrated: an account that set the one-cell version of this is
      saying what the list says, so it goes on saying it.

      The gate is whether the document carries a list **at all**, not whether the list
      happens to mention that fall — and the difference is the whole of it. An empty list
      is a document written under this shape that has already absorbed the old field and
      then had the override taken off; reading the old field forward there would put back
      the one cell you had just cleared, every time, for ever. No list at all is a
      document written before any of this existed, which is the only one with something
      to say.
    */
    if (Array.isArray(raw.grades)) {
      next.grades = normalizeGrades(raw.grades)
    } else if (raw.winningSlip && SEVERITIES.includes(raw.winningSlip)) {
      next.grades = [{ fall: RETIRED_WINNING_SLIP, severity: raw.winningSlip }]
    }

    if (Array.isArray(raw.marks)) {
      const kept = SEVERITIES.filter(severity => raw.marks?.includes(severity))
      // nothing marked is a screen with nothing on it, which is never what was meant
      if (kept.length > 0) next.marks = kept
    }

    if (Array.isArray(raw.phases)) {
      const kept = normalizePhases(raw.phases)
      // a game with no phases at all is a table with no rows; keep the defaults
      if (kept.length > 0) next.phases = kept
    }
  }

  // a level band wider than the winning one would leave `better` with nothing in it
  next.winning = Math.max(next.winning, next.level + 1)
  return next
}

/**
 * Stored overrides in the shape the rest of the code expects.
 *
 * One entry per fall: a document saying two things about one row is a document that has
 * to be read in order to be understood, so the first wins and the rest go. Shape only —
 * whether the key names a real row is `bands.ts`'s question, and it answers it by not
 * finding one.
 */
export function normalizeGrades(raw: unknown[]): GradeOverride[] {
  const seen = new Set<string>()
  const out: GradeOverride[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { fall, severity } = entry as Partial<GradeOverride>
    if (typeof fall !== 'string' || fall.length === 0) continue
    if (!severity || !SEVERITIES.includes(severity)) continue
    if (seen.has(fall)) continue
    seen.add(fall)
    out.push({ fall, severity })
  }

  return out
}

/**
 * Stored phases in the shape the rest of the code expects.
 *
 * Sorted, strictly increasing, and anchored at move one — two phases starting on the
 * same move would make one of them empty, and a first phase starting at move three
 * would leave your first two moves in no phase at all. Both are fixed here rather
 * than refused, because the editor writes through this on every keystroke and a
 * number you are half way through typing should not be an error.
 */
export function normalizePhases(raw: unknown[]): PhaseSetting[] {
  const cleaned = raw
    .filter((entry): entry is PhaseSetting => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => ({
      name: typeof entry.name === 'string' && entry.name.trim().length > 0
        ? entry.name.trim()
        : `Phase ${index + 1}`,
      from: Math.max(1, Math.round(Number(entry.from)) || 1),
    }))
    .sort((a, b) => a.from - b.from)
    .slice(0, MAX_PHASES)

  // strictly increasing: a repeated start is a phase with no moves in it
  const out: PhaseSetting[] = []
  for (const phase of cleaned) {
    const previous = out[out.length - 1]
    out.push(previous && phase.from <= previous.from ? { ...phase, from: previous.from + 1 } : phase)
  }

  if (out.length > 0) out[0] = { ...out[0], from: 1 }
  return out
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
