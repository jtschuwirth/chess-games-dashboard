/**
 * The move loop: a written-down procedure for choosing a move, and the games played
 * slowly enough to run it.
 *
 * The method is Azel Chua's burger in **its own three steps** — count the material and
 * name the imbalance, read the threats, find the candidates worth calculating — with
 * three things around it. A **book** pass in front, because a move you have already
 * decided is not a move to think about; a **reassess** pass behind, for the positions
 * where the burger comes back empty, which is most of them; and a **commit** check at
 * the end, unconditional, because the common club loss is not a missed win but an
 * allowed one.
 *
 * The quiet pass is **Silman's reassessment** — the imbalances, the side of the board
 * they point at, the position you want, and whether it can be had. It replaced Aagaard's
 * three questions, which are a middlegame instrument and degenerate in an opening: on
 * move four nothing is weak yet, every minor piece is the worst piece, and what the
 * opponent wants is to develop. Silman's inventory carries development, initiative and
 * king safety as imbalances in their own right, so the same four questions have real
 * answers on move four and on move forty.
 *
 * **The two passes share their first step.** Counting the material and naming the
 * imbalance is the burger's own opening move *and* the whole of Silman's first step, so
 * it is asked once, in Pass 1, and the quiet pass starts with that homework already
 * done. Asking it twice would be two inventories of one position with nothing keeping
 * them in step — the rule the rest of this codebase follows about storing a fact twice,
 * one level up in the method itself.
 *
 * **The steps are the failure vocabulary.** Every one of them produces something you
 * write down at the time, which is the whole reason the loop is worth recording: without
 * a per-step artefact a post-mortem can only say the move was bad, and "the algorithm
 * did not work" trains nothing. With one, a mistake is filed under the step that should
 * have caught it, and that is a row you can count over months.
 *
 * One table serves the form and the page that explains the method, the habit
 * `STUDY_SECTIONS` and `ESSENTIALS_SECTIONS` already follow: a screen that explains a
 * rule renders the rule, or it explains what the rule used to be.
 */
import { colorAt, fromPgn, mainLine, START_FEN, toPgn, type MoveTree } from './movetree'
import type {
  Color,
  DailyGame,
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
  /** Tailwind ink for the pass, so a step reads as belonging to one. */
  tone: string
  border: string
  steps: MethodStep[]
}

/**
 * Silman's imbalances, as the checklist under the one step that reads them.
 *
 * It is a longer list than a tactical pass seems to want, and that is the point: this
 * same inventory is the first step of the quiet pass, so writing it here is what lets
 * Pass 2 open with the work already done. Development, initiative and king safety are
 * imbalances in their own right, which is what gives the list something to say about a
 * position four moves old.
 */
const IMBALANCES = [
  'minor pieces — whose bishop or knight is the better one here',
  'pawn structure',
  'space',
  'material',
  'files, ranks and squares',
  'development',
  'initiative',
  'king safety',
]

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
        label: 'Material, and the imbalances',
        prompt: 'the count, then what each side has that the other does not',
        checklist: IMBALANCES,
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
    title: 'Reassess',
    summary:
      'Asked only when Pass 1 found nothing concrete. The imbalances are already ' +
      'written above, so this starts at the one you play — then the position you ' +
      'want, and whether it can be had.',
    branch: 'quiet',
    gate:
      'did a candidate produce something concrete that survives their best reply? ' +
      '→ yes, Pass 3',
    tone: 'text-emerald-300',
    border: 'border-emerald-500/30',
    steps: [
      {
        id: 'side',
        label: 'Which imbalance do I play, and where on the board?',
        prompt: 'the one from Pass 1.1 that favours me, and the side it points at',
        checklist: [
          'the inventory is already written in Pass 1.1',
          'theirs as well — which of their imbalances must I not let grow',
          'play where your advantage is, not where the position looks loudest',
        ],
      },
      {
        id: 'fantasy',
        label: 'What position do I want?',
        prompt: 'the pieces on the squares they belong on — the position, not the route',
        checklist: ['no calculation yet', 'name squares, not intentions'],
      },
      {
        id: 'plan-choice',
        label: 'Is it achievable, and what is the move?',
        prompt: 'if it is not, the nearest one that is — then the move that starts towards it',
        checklist: [
          'if the dream will not go, change the dream rather than the imbalance it is built on',
          'does the move concede anything their own imbalances point at',
        ],
      },
    ],
  },
  {
    id: 'commit',
    number: '3',
    title: 'Commit',
    summary:
      'Unconditional, both branches. A club game is lost to what you allowed far more ' +
      'often than to what you missed.',
    branch: 'always',
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
 * Everything a move can be filed under: the eight steps, then the two that are failures
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
    Object.values(log.answers).some(answer => (answer ?? '').trim().length > 0)
  )
}

/** How much of the loop a log answered, out of the steps that were asked of it. */
export function logProgress(log: MoveLog, inBook = false): { asked: number; answered: number } {
  const steps = passesFor(log.concrete, inBook).flatMap(pass => pass.steps)
  const answered = steps.filter(step => (log.answers[step.id] ?? '').trim().length > 0).length
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
 * The quiet pass is not: Aagaard's weaknesses, worst piece and opponent's plan are not
 * Silman's imbalance, fantasy and plan, so those three retire with nothing to carry them
 * onto. An answer under one is dropped rather than filed under a question it does not
 * answer — the habit every stored shape here follows, which is to read forward where
 * there is something to read forward to and to drop what there is not.
 */
const RETIRED_STEPS: Record<string, MoveStepId> = {
  goal: 'material',
  'their-motifs': 'threats',
  'my-motifs': 'threats',
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
