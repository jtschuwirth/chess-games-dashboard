/** The sites a game can be synced from. Syncing only ever speaks about these. */
export type ProviderSource = 'chesscom' | 'lichess'

/** Where a game came from. `upload` is one you pasted in yourself to study. */
export type Source = ProviderSource | 'upload'

export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily'

export type Color = 'white' | 'black'

export type OpeningColor = Color | 'any'

export type GameResult = 'win' | 'loss' | 'draw'

export const TIME_CLASSES: TimeClass[] = ['bullet', 'blitz', 'rapid', 'classical', 'daily']

export const SOURCE_LABEL: Record<Source, string> = {
  chesscom: 'Chess.com',
  lichess: 'Lichess',
  upload: 'Uploaded',
}

/** A game as it comes back from a provider route — no id, no ignore flag yet. */
export interface SyncedGame {
  source: Source
  sourceId: string
  url: string
  playedAt: number
  timeClass: TimeClass
  timeControl: string
  color: Color
  result: GameResult
  termination: string
  opponent: string
  /** The opponent is an engine, not a person. Lichess reports this; chess.com does not. */
  opponentIsBot: boolean
  opponentRating: number | null
  userRating: number | null
  eco: string | null
  openingName: string | null
  /** Full move list in SAN. */
  moves: string[]
  /**
   * Seconds left on the clock after each ply, index-aligned with `moves`. Null when the
   * provider gave none — daily games, or a game synced before clocks were captured.
   */
  clocks: number[] | null
}

/** A game as stored in Firestore under users/{uid}/games/{id}. */
export interface GameRecord extends SyncedGame {
  /** `chesscom_${uuid}` | `lichess_${id}` — deterministic so re-syncs dedupe. */
  id: string
  /** Engine analysis of your own moves, once it has been run. */
  analysis?: StoredAnalysis
  /** The game with the analysis written onto it, ready to paste into a board. */
  annotatedPgn?: string
  /** Your own root-cause analysis of the moves that went wrong. */
  review?: GameReview
  /**
   * How you have done when the drill put these positions back in front of you,
   * keyed by ply. Kept beside the review rather than inside it so a position the
   * engine flagged but you never wrote up can still be drilled.
   */
  drills?: Record<string, DrillStat>
  /**
   * The second pass's reading of each marked move, keyed by ply. Beside the analysis
   * rather than inside it because it is produced separately, on request, and because a
   * re-analysis should not silently throw these away.
   */
  verdicts?: Record<string, MoveVerdict>
}

/** Your record on one position in the drill. */
export interface DrillStat {
  attempts: number
  /** Attempts where you found a move that holds. */
  correct: number
  lastAt: number
  /** Whether the most recent attempt was right — what "sticking" is read from. */
  lastCorrect: boolean
}

/**
 * One move taken apart: what went wrong, what would have shown it, and what you
 * would play instead. The tags are the point — they accumulate into a record of
 * which ideas keep costing you games.
 */
export interface ReviewedMistake {
  /** Index into the game's move list, which identifies the move exactly. */
  ply: number
  /** The move played, kept here so the entry reads on its own. */
  san: string
  /** Your own move number, the one the phase ranges count. */
  moveNumber: number
  /**
   * What you were trying to do when you played it. Optional: it was added after
   * reviews had already been written, and those entries are not wrong for lacking it.
   */
  intent?: string
  /** Why the move is a mistake. */
  cause: string
  /** What was visible in the position that should have redirected you. */
  signal: string
  /**
   * Moves you would play instead, each with your reasoning. Read them through
   * `betterMovesOf`: reviews written before the reasoning existed stored plain SAN
   * strings here, and that shape is still in Firestore.
   */
  betterMoves: ProposedMove[]
  /** From the shared vocabulary in lib/review.ts, or your own additions. */
  tags: string[]
  /**
   * The engine is right and you still could not reasonably have found it. Kept on
   * record but left out of the tag counts, since there is no pattern to train.
   */
  unreasonable: boolean
  /** The engine's numbers when you reviewed it, so the entry survives a re-analysis. */
  cpBefore: number | null
  cpAfter: number | null
}

/**
 * A line you would play instead of the move you played. The reason is the point: a bare
 * move is a line to memorise, while the reason is what you can apply in the next game.
 *
 * `line` is one or more plies in SAN from the position before the mistake. Only its
 * first move is a decision you actually get to make — the rest is the continuation you
 * were counting on, which is worth recording and worth being able to play out.
 */
export interface ProposedMove {
  line: string[]
  /** Why it holds the game. Optional — sometimes the move really does speak for itself. */
  why: string
}

export interface GameReview {
  reviewedAt: number
  /** One to three moves — a review that blames everything explains nothing. */
  mistakes: ReviewedMistake[]
  /** Anything about the game as a whole. */
  notes: string
}

/** What `analyzeGame` produced, flattened for Firestore. */
export interface StoredAnalysis {
  depth: number
  analyzedAt: number
  blunders: number
  mistakes: number
  inaccuracies: number
  moves: {
    ply: number
    san: string
    moveNumber: number
    cpBefore: number
    cpAfter: number
    cpLoss: number
    tag: string
  }[]
}

export interface OpeningLine {
  id: string
  name: string
  /** The line exactly as the user typed it. */
  pgn: string
  /** Normalized SAN move list. */
  moves: string[]
  /** FEN fields 1-3 after the last move — what games are matched against. */
  positionKey: string
  ply: number
  color: OpeningColor
}

export type NewOpeningLine = Omit<OpeningLine, 'id'>

/**
 * What kind of idea a pattern is. Deliberately short: a pattern you cannot file
 * under one of these is usually two patterns.
 */
/**
 * What kind of mistake a marked move was — not how much it cost, which the engine
 * already says, but what sort of advantage went with it.
 */
export type VerdictKind =
  | 'threw-it'
  | 'lost-the-thread'
  | 'concrete-line'
  | 'from-level'
  | 'from-worse'

/**
 * The second pass's reading of one marked move, kept beside the analysis because it is
 * just as expensive to produce: one MultiPV search at full depth per move.
 *
 * Keyed by ply in `verdicts` on the game, the same as `drills`, so a re-analysis does
 * not scramble them and two moves of one game can never overwrite each other.
 */
export interface MoveVerdict {
  ply: number
  /** Your material minus theirs, in pawns, before the move. What the rules weigh. */
  material: number
  /**
   * What that weight is made of: your count minus theirs per piece type, zeroes left
   * out. `+3` is a knight to one reader and three pawns to another, and they are not the
   * same position — this is the half that says which.
   *
   * Superseded by `pieces`, which the imbalance is derived from; kept so verdicts
   * written before that still read.
   */
  materialBy?: Record<string, number>
  /**
   * What is actually on the board for each side, by piece type, kings left out.
   *
   * The difference alone cannot answer "was this a rook ending" or "were the queens
   * off" — a level position is level whether it holds two pawns or two queens. The
   * inventory can, which is what makes a slice like "every mistake I make in a rook
   * ending" findable at all.
   */
  pieces?: { mine: Record<string, number>; theirs: Record<string, number> }
  /**
   * The moves the search looked at, best first, and whether each one held.
   *
   * Kept rather than only counted: the search has already found them, and "two of five
   * held" does not answer the question you actually have, which is what to play instead.
   */
  candidates?: { san: string; cp: number; holds: boolean }[]
  /** The best score in that search, from your side. Not the stored `cpBefore`. */
  best: number
  /** How many of the candidates looked at would not have been a fault. */
  holds: number
  /** How many were looked at, so `holds` reaching it reads as "at least". */
  looked: number
  verdict: VerdictKind
  depth: number
  judgedAt: number
  /**
   * Set when you have thrown the reading out. Kept rather than deleted, so running the
   * pass again does not hand you back something you have already rejected.
   */
  dismissed?: boolean
}

export type PatternKind = 'tactics' | 'strategy' | 'development' | 'endgame'

/**
 * A game that shows a pattern, opened at the move where the idea appears.
 *
 * The whole PGN is kept, not just the position: the moves before the idea are how you
 * recognise when you are heading for it, and the moves after are what it was worth.
 * `startPly` is only where the board opens — you can still step anywhere in the game.
 */
export interface PatternLine {
  /** What this line is called — "Catalan opening", "Panov Attack". */
  title: string
  /** The PGN exactly as pasted, so it can be re-read and re-pointed later. */
  pgn: string
  /** Normalized SAN, parsed from the PGN at save time. */
  moves: string[]
  /** Index of the ply the board opens on. 0 is the position before White's first move. */
  startPly: number
  /**
   * Which way round to show it. A pattern almost always belongs to one side — the note
   * says "Black - Catalan" — and reading it from the wrong end is reading a different
   * idea. Absent on lines written before this existed, which read as White.
   */
  orientation?: Color
  /** What to notice about the line as a whole. */
  note: string
  /**
   * What to notice at one point in it, keyed by how many half-moves have been played.
   * So `7` is the comment on the seventh half-move — the one that produced the position
   * on the board — and `0` is the position before anything.
   *
   * Keyed by that count rather than by the move itself, because the same move can appear
   * twice in one game and the two are not the same thing to say.
   */
  comments?: Record<string, string>
}

/**
 * A thematic pattern: an idea you can carry between openings, written up once so it
 * can be pointed at from a review. The name doubles as a review tag, which is what
 * connects "I should have played this" to the thing you wrote.
 */
export interface PatternRecord {
  id: string
  /** Also the review tag, so it has to read as one. */
  name: string
  kind: PatternKind
  /** When the pattern applies — one condition per entry. */
  conditions: string[]
  /**
   * Games showing the idea, in the order they were added. The first is the one the page
   * leads with, and that is the only thing that makes it first.
   */
  examples: PatternLine[]
  /**
   * The old single "main line". Read by `normalizePattern` and never written again — a
   * pattern is not an opening, so there was no main line for the rest to be variations
   * of, and an endgame idea has no main line at all. They were always examples.
   */
  main?: PatternLine
  /** Saved openings this turns up in, by `OpeningLine` id. */
  openingIds: string[]
  createdAt: number
}

export type NewPattern = Omit<PatternRecord, 'id' | 'main'>

/**
 * One thing to do on one day. No id: the array is rewritten whole on every change, and
 * a task is identified by where it sits in its day, the way a line in a list is.
 *
 * Counted rather than ticked, because most of what a plan asks for comes in quantities —
 * five puzzles, two rapid games — and three of five is neither done nor not done.
 * `target: 1` is an ordinary tick-box and is what a task without a count becomes.
 */
export interface PlanTask {
  text: string
  /** How many are needed. */
  target: number
  /** How many are done, from 0 to `target`. */
  done: number
}

/** A day of a study plan: what to do, how it went, and what you wrote up. */
export interface PlanDay {
  tasks: PlanTask[]
  /** Anything about the day itself — how it felt, what to carry into tomorrow. */
  note: string
}

/** A week of one. Named when you want to; "week 3" when you do not. */
export interface PlanWeek {
  name: string
  days: PlanDay[]
  /**
   * Your rating going into this week, keyed by tracked pool (`chesscom:rapid`).
   *
   * Stored rather than derived, unlike almost everything else here, for one reason: it
   * is read off the last game before the week started, and games from before you began
   * syncing are not in the app. A derived figure would be blank for exactly the early
   * weeks a plan is measured against. Filled by a button and editable by hand.
   */
  ratings?: Record<string, number | null>
}

/**
 * A stretch of deliberate practice, in weeks of days. Positions carry the dates: the
 * first day is `startDate` and every day after is one more, counted across weeks — which
 * is what lets a day find the reviews you wrote on it without either storing a link to
 * the other.
 */
export interface StudyPlan {
  id: string
  name: string
  /** Local midnight of day one, as epoch ms. */
  startDate: number
  weeks: PlanWeek[]
  createdAt: number
}

export type NewStudyPlan = Omit<StudyPlan, 'id'>

export interface UserProfile {
  chesscomUsername: string | null
  lichessUsername: string | null
  lastSyncAt: number | null
}

export interface ProviderResponse {
  games: SyncedGame[]
  warnings: string[]
}
