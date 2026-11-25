/**
 * The move loop: a written-down procedure for choosing a move, and the games played
 * slowly enough to run it.
 *
 * The method is Azel Chua's, twice over. Pass 1 is his **burger** in its own three steps
 * — count the material, read the threats, find the candidates worth calculating. Pass 2,
 * asked only when the burger came back with nothing concrete, is his **evaluation
 * technique**: five points — material, king safety, piece activity, centre control,
 * pawn structure — each judged equal, White better or Black better, and ranked in that
 * order. The highest point you lead on is what the position is played for, even where a
 * lower one offers a target: a lead in activity is pressed before a better structure is
 * cashed, because activity is the one that goes away if you wait. It ends in candidates,
 * the way the burger does, so both branches arrive at Pass 3 with a move.
 *
 * Around them, a **book** pass in front, because a move you have already decided is not
 * a move to think about; and a **commit** pass at the end, unconditional, which is where
 * the evaluation is written and then the blunder check run. The evaluation is last on
 * purpose: a number has to come out of having read the position, and a box for it at the
 * top of the form invited one before anything had been read.
 *
 * **The steps are the failure vocabulary.** Every one of them produces something you
 * write down at the time, which is the whole reason the loop is worth recording: without
 * a per-step artefact a post-mortem can only say the move was bad, and "the algorithm
 * did not work" trains nothing. With one, a mistake is filed under the step that should
 * have caught it, and that is a row you can count over months.
 *
 * One table serves the form and the page that explains the method, the habit
 * `STUDY_PANELS` and `ESSENTIALS_SECTIONS` already follow: a screen that explains a
 * rule renders the rule, or it explains what the rule used to be.
 */
import { colorAt, fromPgn, mainLine, START_FEN, toPgn, type MoveTree } from './movetree'
import type {
  Color,
  DailyGame,
  TechniquePointId,
  TechniqueVerdict,
  MoveFailureId,
  MoveLog,
  MoveStepId,
  NewDailyGame,
  SyncedGame,
} from '@/types/chess'

/** Which pass a step belongs to. */
export type MethodPassId = 'book' | 'burger' | 'plan' | 'commit'

/**
 * When a pass is asked for.
 *
 * `quiet` is the one branch in the loop: Pass 2 is asked only when Pass 1 came back
 * with nothing concrete. The form honours it, which is what makes filling the form the
 * same act as running the method rather than a transcription of it afterwards.
 */
export type PassBranch = 'always' | 'quiet'

export interface MethodStep {
  id: MoveStepId
  /** The question, in the first person, because it is the one you ask yourself. */
  label: string
  /** What goes in the box — a noun phrase, never the form addressing you as "you". */
  prompt: string
  /** The checklist, where the step has one. Shown under the box, not as prose. */
  checklist?: string[]
}

export interface MethodPass {
  id: MethodPassId
  /** How the method numbers it. */
  number: string
  title: string
  /** One line saying what the pass is for, and nothing the steps already say. */
  summary: string
  branch: PassBranch
  /**
   * The question answered immediately *before* this pass, where reaching it is not
   * automatic. It lives on the pass rather than in the screen that draws it, so the
   * two branches in the method are part of the method rather than part of a layout.
   */
  gate?: string
  /**
   * Whether this pass opens with the evaluation — the number and the line it is the
   * value of. One pass carries it: the one that comes after the reading is done.
   */
  evaluates?: boolean
  /** Tailwind ink for the pass, so a step reads as belonging to one. */
  tone: string
  border: string
  steps: MethodStep[]
}

export interface TechniquePoint {
  id: TechniquePointId
  label: string
}

/**
 * Azel Chua's evaluation technique, highest first.
 *
 * The order **is** the rule. Two leads are not added up: the higher one decides what to
 * play for, and the lower one is what you keep while doing it.
 */
export const TECHNIQUE_POINTS: TechniquePoint[] = [
  { id: 'material', label: 'Material' },
  { id: 'king-safety', label: 'King safety' },
  { id: 'activity', label: 'Piece activity' },
  { id: 'centre', label: 'Centre control' },
  { id: 'structure', label: 'Pawn structure' },
]

export const TECHNIQUE_IDS: TechniquePointId[] = TECHNIQUE_POINTS.map(point => point.id)

export const VERDICT_WORD: Record<TechniqueVerdict, string> = {
  white: 'White',
  equal: '=',
  black: 'Black',
}

export interface TechniqueLead {
  point: TechniquePoint
  side: Color
}

/**
 * The highest point one side leads on, or nothing.
 *
 * Read for one side at a time, because the pass asks two questions — what is mine to
 * press, and what of theirs must I not let grow — and each answer is the first point
 * down the hierarchy that favours that side.
 */
export function techniqueLead(
  verdicts: MoveLog['technique'],
  side: Color,
): TechniqueLead | null {
  for (const point of TECHNIQUE_POINTS) {
    if (verdicts?.[point.id] === side) return { point, side }
  }
  return null
}

/** The verdicts in one line, for a log read back: `Material = · Piece activity White`. */
export function techniqueSummary(verdicts: MoveLog['technique']): string {
  return TECHNIQUE_POINTS.flatMap(point => {
    const verdict = verdicts?.[point.id]
    return verdict === undefined ? [] : [`${point.label} ${VERDICT_WORD[verdict]}`]
  }).join(' · ')
}

/**
 * The technique's own breakdown of step two, read over the whole board rather than per
 * side: the worked example in the book names White's loose rook and Black's loose pawns
 * in one breath, because a threat is a fact about the position and not about a player.
 *
 * **Unprotected and hanging are two different ledger states**, which is why they are two
 * lines rather than the book's one. Unprotected is attackers equal to defenders — 0 for
 * 0 as much as 2 for 2 — and hanging is attackers outnumbering them. The move the
 * technique is hunting for is the one that shifts that ledger: after it, two things are
 * hanging and one move cannot cover both.
 */
const THREAT_CHECKLIST = [
  'unprotected — attackers equal defenders, 0 for 0 as much as 2 for 2',
  'hanging — attackers outnumber defenders',
  'x-ray attacks',
  'mating possibilities',
  'trappable pieces',
  'pinned, pinnable, forkable and skewerable pieces',
  'critical lines and squares',
]

export const METHOD_PASSES: MethodPass[] = [
  {
    id: 'book',
    number: '0',
    title: 'Book',
    summary:
      'A move already decided is not a move to think about. But a deviation is the ' +
      'cheapest tactic in the game, so leaving book sends you straight to Pass 1.',
    branch: 'always',
    tone: 'text-sky-300',
    border: 'border-sky-500/30',
    steps: [
      {
        id: 'book',
        label: 'Am I still in a line I have saved?',
        prompt: 'the line, and where they left it',
      },
    ],
  },
  {
    id: 'burger',
    number: '1',
    title: 'Burger',
    summary:
      'The tactical read, in the three steps the technique has: what is on the board, ' +
      'what is loose on it, and only then the moves worth calculating.',
    branch: 'always',
    gate: 'still in your preparation? → play it, and go straight to Pass 3',
    tone: 'text-amber-300',
    border: 'border-amber-500/30',
    steps: [
      {
        id: 'material',
        label: 'Material',
        prompt: 'the count — who is up, and by what',
      },
      {
        id: 'threats',
        label: 'Existing and potential threats',
        prompt: 'both sides, one per line: the piece, the square, who is attacking it',
        checklist: THREAT_CHECKLIST,
      },
      {
        id: 'candidates',
        label: 'Candidates, calculated',
        prompt: 'one per line: the move, the line, what it is worth',
        checklist: [
          'the threats above are the candidate list, forcing or not',
          'only if they came back empty: checks, then captures, then threats',
          'what you are hunting for is a move that shifts the ledger — two of theirs ' +
            'hanging and one move to cover both',
          'a candidate that fails names the fault: the next one has to fix that fault, ' +
            'not be a fresh guess',
          'calculate each to a quiet position before judging it',
        ],
      },
    ],
  },
  {
    id: 'plan',
    number: '2',
    title: 'Evaluate',
    summary:
      'Asked only when Pass 1 found nothing concrete. Five points, highest first, each ' +
      'judged equal or better for one side — and the highest one you lead on is what ' +
      'you play for, even with a target lower down.',
    branch: 'quiet',
    gate:
      'did a candidate produce something concrete that survives their best reply? ' +
      '→ yes, Pass 3',
    tone: 'text-emerald-300',
    border: 'border-emerald-500/30',
    steps: [
      {
        id: 'technique',
        label: 'Who is better, point by point?',
        prompt: 'what makes each one better — the piece, the square, the file',
        checklist: [
          ...TECHNIQUE_POINTS.map(point => point.label.toLowerCase()),
          'a point higher up outranks everything below it',
        ],
      },
      {
        id: 'lead',
        label: 'Candidates that press the lead',
        prompt: 'one per line: the move, how it grows the lead, what it is worth',
        checklist: [
          'the move that grows the highest lead, before one that cashes a lower one',
          'theirs as well — which of their leads must I not let grow',
          'a candidate that fails names the fault: the next one has to fix that fault',
          'calculate each to a quiet position before judging it',
        ],
      },
    ],
  },
  {
    id: 'commit',
    number: '3',
    title: 'Commit',
    summary:
      'Unconditional, both branches. What the position is worth now that it has been ' +
      'read — then the check a club game is most often lost for want of.',
    branch: 'always',
    evaluates: true,
    tone: 'text-rose-300',
    border: 'border-rose-500/30',
    steps: [
      {
        id: 'blunder-check',
        label: 'After my move: their checks, captures, threats',
        prompt: 'their best reply, and why I am still fine',
        checklist: [
          'what of mine is loose, or newly loose',
          'does it concede a square I named myself',
          'does it help the plan I wrote down for them',
          'if their reply refutes it, name the fault and look for the candidate that ' +
            'fixes that one thing',
        ],
      },
    ],
  },
]

export const METHOD_STEPS: MethodStep[] = METHOD_PASSES.flatMap(pass => pass.steps)

/** Every step id, in the order the loop asks them. Also the failure vocabulary. */
export const METHOD_STEP_IDS: MoveStepId[] = METHOD_STEPS.map(step => step.id)

export const STEP_LABEL: Record<MoveStepId, string> = Object.fromEntries(
  METHOD_STEPS.map(step => [step.id, step.label]),
) as Record<MoveStepId, string>

/**
 * Everything a move can be filed under: the steps, then the two that are failures
 * without being steps. `none` sits last because it is the answer you reach after trying
 * the others, not one of them.
 */
export const FAILURE_IDS: MoveFailureId[] = [...METHOD_STEP_IDS, 'gate', 'none']

export function isFailureId(raw: string): raw is MoveFailureId {
  return (FAILURE_IDS as string[]).includes(raw)
}

export const FAILURE_LABEL: Record<MoveFailureId, string> = {
  ...STEP_LABEL,
  gate: 'The gate went the wrong way',
  none: 'No step would have caught it',
}

/**
 * Whether a filing says a step of the loop failed.
 *
 * `none` is stored and then left out of every tally, the rule the review form's "hard
 * to find" already follows: a move nothing would have caught must not read as a step
 * that failed, or the one row you would act on is inflated by the moves you could do
 * nothing about.
 */
export function blamesAStep(failed: MoveFailureId | undefined): boolean {
  return failed !== undefined && failed !== 'none'
}

/**
 * Whether your preparation still covers this move.
 *
 * Absent `leftBookAt` reads as still in book, which is true at the start of every game.
 * Derived from the one field rather than stored per move: a game leaves book once.
 */
export function inBookAt(game: DailyGame, ply: number): boolean {
  return game.leftBookAt === undefined || ply < game.leftBookAt
}

/**
 * The game with the end of your preparation moved to this move, or back off it.
 *
 * `out` sets the boundary here, so this move and everything after it is yours to find.
 * `in` puts it at your *next* move — saying this one is still book is saying the game
 * left book no earlier than the one after it — which is also how a mispress is undone
 * from the move it was made on.
 */
export function withBookEnd(game: DailyGame, ply: number, out: boolean): DailyGame {
  return { ...game, leftBookAt: out ? ply : ply + 2 }
}

/**
 * Which passes are asked of a move.
 *
 * Two gates, and they are the whole reason the form is worth filling in rather than
 * being a sheet of boxes you learn to skip half of.
 *
 * **Book is the first, and it is terminal.** A move your preparation already decided is
 * not a move to think about, so asking what you are playing for and what their threats
 * are is asking you to justify a move you are not choosing — the kind of question that
 * gets answered "as usual" four times and then stops being read at all.
 *
 * It does **not** skip the commit check, and that is deliberate rather than an
 * oversight. Playing a prepared move blind is exactly how a prepared line gets walked
 * into, and the whole reason the book pass is a pass at all rather than a reflex is that
 * the move still has to survive their reply.
 *
 * The second gate is quietness: something concrete takes the plan pass off, because
 * there was nothing quiet to plan in.
 */
export function passesFor(concrete: boolean, inBook = false): MethodPass[] {
  if (inBook) return METHOD_PASSES.filter(pass => pass.id === 'book' || pass.id === 'commit')
  return METHOD_PASSES.filter(
    pass => pass.id !== 'book' && (pass.branch === 'always' || !concrete),
  )
}

/* ------------------------------------------------------------------- a log */

/**
 * Whether a step has been answered. The technique counts a pressed verdict as an answer,
 * since the five chips are the step and the box under them only holds the reasons.
 */
export function stepAnswered(log: MoveLog, id: MoveStepId): boolean {
  if ((log.answers[id] ?? '').trim().length > 0) return true
  return id === 'technique' && Object.keys(log.technique ?? {}).length > 0
}

/** The log with one point of the technique judged, or cleared by pressing it again. */
export function withVerdict(
  log: MoveLog,
  point: TechniquePointId,
  verdict: TechniqueVerdict,
): MoveLog {
  const technique = { ...log.technique }
  if (technique[point] === verdict) delete technique[point]
  else technique[point] = verdict

  const next: MoveLog = { ...log, technique }
  // left out rather than stored empty, the rule every optional field here follows
  if (Object.keys(technique).length === 0) delete next.technique
  return next
}

export function emptyLog(ply: number): MoveLog {
  return { ply, concrete: false, evaluation: null, line: '', answers: {} }
}

/**
 * An evaluation typed by hand, in pawns.
 *
 * `+1.5`, `1.5`, `-0.3` and `0` all read; anything else is nothing rather than a guess,
 * because a number nobody meant would be scored against the engine as though it were an
 * opinion.
 */
export function parseEvalInput(raw: string): number | null {
  const text = raw.trim().replace(/^\+/, '')
  if (text.length === 0) return null

  const value = Number(text)
  if (!Number.isFinite(value)) return null

  return Math.max(-99, Math.min(99, Math.round(value * 100) / 100))
}

/** An evaluation as it is written down: signed, two decimals, White's side. */
export function formatEvalGuess(value: number | null): string {
  if (value === null) return ''
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

/** Whether a log says anything, for dropping the ones opened and left. */
export function logHasContent(log: MoveLog): boolean {
  return (
    log.concrete ||
    log.evaluation !== null ||
    log.line.trim().length > 0 ||
    Object.keys(log.technique ?? {}).length > 0 ||
    Object.values(log.answers).some(answer => (answer ?? '').trim().length > 0)
  )
}

/** How much of the loop a log answered, out of the steps that were asked of it. */
export function logProgress(log: MoveLog, inBook = false): { asked: number; answered: number } {
  const steps = passesFor(log.concrete, inBook).flatMap(pass => pass.steps)
  const answered = steps.filter(step => stepAnswered(log, step.id)).length
  return { asked: steps.length, answered }
}

/* ---------------------------------------------------------------- the games */

/** The plies that are yours to play, by index into the move list. */
export function yourPlies(game: DailyGame, upTo: number): number[] {
  const plies: number[] = []
  for (let ply = 0; ply <= upTo; ply += 1) {
    if (colorAt(START_FEN, ply) === game.color) plies.push(ply)
  }
  return plies
}

/** Whether the move about to be played from this position is yours. */
export function isYourMove(color: Color, ply: number): boolean {
  return colorAt(START_FEN, ply) === color
}

export interface DailyProgress {
  /** Your moves played so far. */
  moves: number
  /** How many of them you wrote down. */
  logged: number
}

/**
 * How far through the game the writing is.
 *
 * Counted against *your* moves only. Theirs are positions to read, not moves to choose,
 * so counting them would leave a finished game reading as half done for ever.
 */
export function dailyProgress(game: DailyGame): DailyProgress {
  const yours = yourPlies(game, game.moves.length - 1)
  const logged = yours.filter(ply => {
    const log = game.logs[String(ply)]
    return log !== undefined && logHasContent(log)
  }).length

  return { moves: yours.length, logged }
}

/** The game as a tree, so one board component draws it like every other line. */
export function dailyTree(game: DailyGame): MoveTree {
  try {
    return fromPgn(game.pgn, START_FEN)
  } catch {
    return fromPgn('', START_FEN)
  }
}

/** The moves of a tree written back onto the game, after one was played on the board. */
export function dailyFromTree(game: DailyGame, tree: MoveTree): DailyGame {
  return { ...game, pgn: toPgn(tree), moves: mainLine(tree) }
}

/**
 * The finished game as an ordinary game document, so everything else can read it.
 *
 * This is the whole of how the post-mortem gets its evaluations: the app already turns
 * a pasted PGN into a game, and a game is what the engine, the review, the drill and
 * the mistakes dashboard all work on. Bringing a daily game in therefore costs nothing
 * new — and the post-mortem reads `analysis.moves` off it rather than running a second
 * engine of its own, which is the rule the analysis skill states outright.
 *
 * `sourceId` is the daily game's own id rather than a fingerprint of the moves. An
 * upload is fingerprinted so that pasting the same game twice lands on one document;
 * here the daily game *is* the identity, so re-bringing it in after a correction must
 * land on the same document and not mint a second one beside it.
 *
 * `timeControl` is empty and the class is `daily`. A daily game has no clock the rest of
 * the app can compare — per-move timing means nothing at three days a move — and an
 * invented control would put a chip in the Control row that nothing else matches.
 */
export function uploadFrom(game: DailyGame): SyncedGame {
  return {
    source: 'upload',
    sourceId: `daily${game.id}`,
    url: game.url ?? '',
    playedAt: game.createdAt,
    timeClass: 'daily',
    timeControl: '',
    color: game.color,
    result: game.result ?? 'draw',
    termination: 'unknown',
    opponent: game.opponent,
    opponentIsBot: false,
    opponentRating: null,
    userRating: null,
    eco: null,
    openingName: null,
    moves: game.moves,
    clocks: null,
  }
}

/* ------------------------------------------------------------ stored shapes */

/**
 * Step ids the loop has retired, read forward onto what replaced them.
 *
 * v1 asked *what am I playing for* where the technique's own first step is the material
 * and the imbalance, and it split the threats into theirs and mine where the book reads
 * the whole board at once. Both are the same questions renamed, so an answer written
 * under the old id is an answer to the new one.
 *
 * The quiet pass has been replaced twice. Its last question — *what is the move* — is
 * the one the technique's candidates now answer, so `plan-choice` reads forward onto
 * `lead`. The rest (Aagaard's weaknesses, worst piece and opponent's plan; Silman's
 * imbalance and fantasy) are not questions the five points ask, so they retire with
 * nothing to carry them onto. An answer under one is dropped rather than filed under a
 * question it does not answer — the habit every stored shape here follows, which is to
 * read forward where there is something to read forward to and to drop what there is not.
 */
const RETIRED_STEPS: Record<string, MoveStepId> = {
  goal: 'material',
  'their-motifs': 'threats',
  'my-motifs': 'threats',
  'plan-choice': 'lead',
}

/**
 * A stored filing in the vocabulary as it stands, or nothing.
 *
 * A renamed step is read forward; a retired one and a step that never existed get the
 * same answer, so the move reads as unfiled rather than as a row the tally cannot count.
 */
export function readFailure(raw: unknown): MoveFailureId | null {
  if (typeof raw !== 'string') return null
  const id = RETIRED_STEPS[raw] ?? raw
  return isFailureId(id) ? id : null
}

function normalizeLog(raw: unknown, ply: number): MoveLog | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Partial<MoveLog>

  const answers: Partial<Record<MoveStepId, string>> = {}
  const stored = (entry.answers ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(stored)) {
    if (typeof value !== 'string' || value.length === 0) continue
    const id = (RETIRED_STEPS[key] ?? key) as MoveStepId
    if (!(METHOD_STEP_IDS as string[]).includes(id)) continue
    // two retired steps can land on one: both halves of the old threat question are
    // answers to the question that replaced them, so they are joined rather than one of
    // them silently winning
    const written = answers[id]
    answers[id] = written === undefined ? value : `${written}\n${value}`
  }

  const log: MoveLog = {
    ply: typeof entry.ply === 'number' ? entry.ply : ply,
    concrete: entry.concrete === true,
    evaluation: typeof entry.evaluation === 'number' ? entry.evaluation : null,
    line: typeof entry.line === 'string' ? entry.line : '',
    answers,
  }
  const technique: Partial<Record<TechniquePointId, TechniqueVerdict>> = {}
  const storedTechnique = (entry.technique ?? {}) as Record<string, unknown>
  for (const id of TECHNIQUE_IDS) {
    const verdict = storedTechnique[id]
    if (verdict === 'white' || verdict === 'equal' || verdict === 'black') {
      technique[id] = verdict
    }
  }
  if (Object.keys(technique).length > 0) log.technique = technique
  if (typeof entry.minutes === 'number') log.minutes = entry.minutes
  // an unknown value is dropped rather than passed through, so a hand-edited document
  // cannot invent a step for the tally to count
  const failed = readFailure(entry.failed)
  if (failed !== null) log.failed = failed
  if (typeof entry.lesson === 'string' && entry.lesson.length > 0) log.lesson = entry.lesson

  return log
}

/**
 * A stored game in the shape the code expects.
 *
 * The moves are re-read from the PGN rather than trusted: the two are copies of one
 * thing and the PGN is the authority, the rule every line in this codebase follows.
 */
export function normalizeDailyGame(raw: DailyGame): DailyGame {
  const pgn = typeof raw.pgn === 'string' ? raw.pgn : ''

  let moves: string[] = []
  try {
    moves = mainLine(fromPgn(pgn, START_FEN))
  } catch {
    moves = []
  }

  const logs: Record<string, MoveLog> = {}
  const storedLogs = (raw.logs ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(storedLogs)) {
    const ply = Number(key)
    if (!Number.isInteger(ply) || ply < 0) continue
    const log = normalizeLog(value, ply)
    if (log) logs[key] = log
  }

  const game: DailyGame = {
    ...raw,
    opponent: typeof raw.opponent === 'string' ? raw.opponent : '',
    color: raw.color === 'black' ? 'black' : 'white',
    pgn,
    moves,
    logs,
    finished: raw.finished === true,
    note: typeof raw.note === 'string' ? raw.note : '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
  }

  if (
    typeof raw.leftBookAt !== 'number' ||
    !Number.isInteger(raw.leftBookAt) ||
    raw.leftBookAt < 0
  ) {
    delete game.leftBookAt
  }
  if (typeof raw.url !== 'string' || raw.url.trim().length === 0) delete game.url
  if (raw.result !== 'win' && raw.result !== 'loss' && raw.result !== 'draw') {
    delete game.result
  }
  if (typeof raw.gameId !== 'string' || raw.gameId.length === 0) delete game.gameId

  return game
}

/**
 * The stored shape, without the document id Firestore keeps separately.
 *
 * Every optional field is set or left out and never assigned `undefined` — Firestore
 * rejects the whole document over one of those, not the field. `updatedAt` is stamped
 * by the write, so a save can neither forget it nor round-trip a stale one.
 */
export function dailyBody(game: DailyGame): NewDailyGame {
  const body: NewDailyGame = {
    opponent: game.opponent,
    color: game.color,
    pgn: game.pgn,
    moves: game.moves,
    logs: game.logs,
    finished: game.finished,
    note: game.note,
    createdAt: game.createdAt,
  }

  if (game.leftBookAt !== undefined) body.leftBookAt = game.leftBookAt
  if (game.url && game.url.trim().length > 0) body.url = game.url.trim()
  if (game.result) body.result = game.result
  if (game.gameId) body.gameId = game.gameId

  return body
}
