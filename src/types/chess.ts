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
  /**
   * The game with the variations you have played out on it, as PGN.
   *
   * Written by hand with `toPgn`, because chess.js parses `( )` and then drops it.
   * The whole game is in here beside the branches rather than only the branches: it
   * costs a few hundred bytes, it pastes straight into any board, and a branch with
   * nothing to hang off is not a thing anyone can read.
   *
   * It is never the authority on what was played — `gameTree` merges it into a tree
   * built from `moves`, so a stored branch can never rewrite the game.
   */
  variationsPgn?: string
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
  /**
   * Other moves where you made this same mistake before you saw it.
   *
   * The moves themselves are different — that is rather the point. One idea you failed to
   * see for four turns running produces four different moves and is one thing that went
   * wrong, so these are not entries of their own: writing it up four times would say the
   * same sentence four times and count the tag four times. They carry no answers — the
   * parent's cause, tags and alternatives are theirs. Absent on reviews written before
   * this existed.
   */
  repeats?: MistakeRepeat[]
}

/**
 * A move covered by another entry. The move text is stored beside the ply for the same
 * reason the evaluations are: a re-analysis can change which plies are marked, and an
 * entry has to stay readable when it does.
 */
export interface MistakeRepeat {
  ply: number
  san: string
  moveNumber: number
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

/**
 * Something worth saying about a move that was not a mistake.
 *
 * The root-cause form asks four questions — what you were doing, what failed, what
 * would have caught it, what to play instead — and every one of them presumes the move
 * went wrong. Most of what is worth writing down about a game does not: the idea you
 * found, the move you were choosing between, the moment it was decided. Answering "why
 * is this a mistake" about those is answering the wrong question, and leaving them
 * unwritten because the only form on offer is the wrong one is how they get lost.
 *
 * So a note is the loose version: what you want to say, what to file it under, and the
 * moves you were weighing. No cause, no signal, no cap — the three-entry limit on
 * mistakes exists because a post-mortem that blames every move explains nothing, and
 * nothing about a note gets worse by there being four of them.
 */
export interface MoveNote {
  ply: number
  san: string
  moveNumber: number
  /** What is worth saying about it. */
  note: string
  /** The same vocabulary the mistakes use — see the note on `tags` there. */
  tags: string[]
  /**
   * The other moves you were choosing between, each with your reasoning. Not
   * `betterMoves`: on a move that was not a mistake there is nothing to be better than.
   */
  alternatives: ProposedMove[]
  /** The engine's numbers when you wrote it, so the entry survives a re-analysis. */
  cpBefore: number | null
  cpAfter: number | null
}

export interface GameReview {
  reviewedAt: number
  /** One to three moves — a review that blames everything explains nothing. */
  mistakes: ReviewedMistake[]
  /** Anything about the game as a whole. */
  notes: string
  /**
   * Moves worth remembering that were not mistakes. Read through `moveNotesOf`:
   * absent on every review written before this existed, and they are not wrong for it.
   */
  moveNotes?: MoveNote[]
}

/** What `analyzeGame` produced, flattened for Firestore. */
export interface StoredAnalysis {
  /**
   * Which build of the first pass wrote this — see `ANALYSIS_VERSION`. Absent on
   * everything written before the field existed, where the depth says it instead.
   */
  version?: number
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

/**
 * Another move order that reaches the same idea.
 *
 * The Panov is a Caro-Kann line and arrives just as often from a Queen's Gambit move
 * order; saving it as a second opening of the same name files it *inside* the first,
 * since the tree nests by literal move prefix, and the repertoire reads Panov › Panov ›
 * Panov. So an opening owns its other ways in instead of being copied for each.
 */
export interface AltLine {
  /** The line exactly as it was typed. */
  pgn: string
  moves: string[]
  positionKey: string
  ply: number
}

export interface OpeningLine {
  id: string
  name: string
  /** The main line, exactly as the user typed it. */
  pgn: string
  /** Normalized SAN move list for the main line — what the tree nests by. */
  moves: string[]
  /** FEN fields 1-3 after the last move of the main line. */
  positionKey: string
  ply: number
  color: OpeningColor
  /**
   * Other move orders reaching this same opening. Absent on every line saved before
   * they existed, which is most of them — read through `openingKeys`, never directly.
   */
  alts?: AltLine[]
  /**
   * Every position that counts as having reached this opening: the main line's and each
   * alternate's. **Derived by `normalizeOpening`, never stored** — it is the main key on
   * a line with no alternates, so the 72 documents written before any of this need
   * nothing done to them. `NewOpeningLine` leaves it out, so no writer can emit it.
   */
  keys: string[]
  /**
   * What you know about this opening. Absent on a line nobody has written up, which is
   * why `normalizeOpening` fills it in on read rather than every caller testing for it.
   */
  study?: OpeningStudy
  /**
   * When any device last saved it. Stamped by `updateOpening`, not carried in the form,
   * so a save can neither forget it nor round-trip a stale one — the plan page's rule,
   * and what lets an unsaved draft be told from one another device has moved past.
   */
  updatedAt?: number
}

export type NewOpeningLine = Omit<OpeningLine, 'id' | 'keys'>

/* ------------------------------------------------------------ opening studies */

/**
 * Which part of a study a written idea belongs to. The sections that hold prose are the
 * only ones here: Variants, Your games and the patterns are read off what is already
 * stored elsewhere, so there is nothing for an idea to sit in.
 */
export type StudySectionId = 'overview' | 'plans'

/** A main plan or a sideline. The split the Notion pages this replaces already used. */
export type IdeaRank = 'main' | 'alternative'

/** Whether a cited game shows the idea working, or shows it going wrong. */
export type CitationKind = 'well' | 'badly'

/**
 * One of your own games under an idea, opened on the move where the idea appears.
 *
 * A game id rather than a pasted PGN, which is the difference between this and a
 * pattern's examples: these are games you played, already analysed and reviewed, and
 * the study is pointing back at them rather than keeping a second copy.
 */
export interface StudyCitation {
  /** A `GameRecord` id. */
  gameId: string
  /**
   * How many half-moves the board opens on. Omitted leaves the game view to open where
   * it normally would — the first reviewed move, else the engine's worst find.
   */
  ply?: number
  shows: CitationKind
  note?: string
}

/**
 * One bullet of a study: a plan, an idea, something worth knowing.
 *
 * What makes it more than a line of prose is what it can point at — the pattern it is an
 * instance of, and the games of yours that show it. Both are ids into collections that
 * already exist, so nothing here is a second copy of anything.
 */
export interface StudyIdea {
  /**
   * Minted when the idea is created, in a handler and never in a render. Citations and
   * ordering hang off it, so it has to outlive an edit.
   */
  id: string
  section: StudySectionId
  /** Whose idea it is. Only the plans section asks. */
  side?: Color
  /** Only the plans section asks. */
  rank?: IdeaRank
  text: string
  /** Thematic patterns this idea is an instance of, by `PatternRecord` id. */
  patternIds?: string[]
  games?: StudyCitation[]
}

/**
 * Which part of a study a link belongs to.
 *
 * Two, and they are reached for at different moments. `lines` is a study of the moves
 * themselves — a lichess study where the variations are worked out in full — which is
 * the detail *behind* this page. `references` is where the page came from: a video, an
 * article, somebody else's write-up. One list holding both would make the thing you open
 * mid-game sit among the things you read once.
 */
export type StudyLinkSectionId = 'lines' | 'references'

/** Somewhere else this is written up — a video, a lichess study, an article. */
export interface StudyLink {
  url: string
  title: string
  /**
   * Which links section it sits under. Every link written before this field existed is a
   * reference, which is what `normalizeStudy` reads a missing one as.
   */
  section: StudyLinkSectionId
}

export interface OpeningStudy {
  ideas: StudyIdea[]
  links: StudyLink[]
  /**
   * Other saved lines this one also reaches, by `OpeningLine` id.
   *
   * A reading aid and nothing more. Games are matched by position and already transpose
   * on their own; making a cross-link count would put the same game in two sibling rows
   * of the dashboard's breakdown and inflate every total above it.
   */
  alsoReaches: string[]
}

/**
 * What kind of idea a pattern is. Deliberately short: a pattern you cannot file
 * under one of these is usually two patterns.
 */
/**
 * What kind of mistake a marked move was — not how much it cost, which the engine
 * already says, but what sort of advantage went with it.
 */
export type VerdictKind =
  | 'walked-into-mate'
  | 'lost-a-won-game'
  | 'handed-over-a-won-game'
  | 'lost-it-in-one'
  | 'gave-the-game-away'
  | 'missed-the-kill'
  | 'let-the-win-go'
  | 'lost-the-thread'
  | 'threw-it'
  | 'threw-it-away'
  | 'missed-the-sharpest'
  | 'eased-off'
  | 'missed-the-follow-up'
  | 'let-the-edge-go'
  | 'gave-it-away'
  | 'missed-a-chance'
  | 'a-loose-move'
  | 'missed-the-line'
  | 'careless'
  | 'missed-the-defence'
  | 'made-it-worse'
  | 'let-it-go'
  | 'missed-the-save'
  | 'already-lost'
  | 'slowed-it-down'
  | 'let-it-slip'
  | 'turned-it-around'
  | 'took-the-slow-road'
  | 'mishandled-the-edge'
  | 'lost-the-plot'
  | 'drifted'
  | 'went-the-wrong-way'
  | 'came-apart'
  | 'defended-badly'
  | 'cracked'
  | 'hung-on-badly'

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
  /**
   * The MultiPV search's own top line, from your side.
   *
   * Not what the candidates are measured against — `reconcile` uses the first pass's
   * `cpBefore` for that. This is kept because it is a measurement, and it is the only
   * record of what the shared search made of the position on its own.
   */
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

export type PatternKind = 'tactics' | 'mate' | 'strategy' | 'development' | 'endgame'

/**
 * The questions the essentials method asks, each answered as a list of short points.
 *
 * The third question — change the position slightly and see what happens — is two
 * fields rather than one flagged list, because the two halves are read as two lists and
 * are written at different times: you find what breaks it first, and what it survives
 * only once you have tried.
 */
/**
 * One answer to one of the method's questions.
 *
 * The text is what you wrote. The `id` is stable and is what a drill record is keyed by,
 * so rewording a point keeps its history rather than quietly starting a new card — the
 * same split the tag vocabulary makes, for the same reason. A point written before ids
 * existed is given one derived from its own text on read, which is stable across reads
 * and becomes permanent the first time the write-up is saved.
 *
 * `fen` turns a boundary into something testable. "Black has an f6 Knight" is a claim
 * about a position, and with that position stored the drill can show it and ask whether
 * the pattern still works — which is the one question about a pattern whose answer you
 * cannot get by recognising a diagram you have already memorised.
 */
export interface EssentialsPoint {
  id: string
  text: string
  /**
   * Why the change breaks it, or why it survives — the half of a boundary the drill
   * asks you for and cannot mark.
   *
   * Optional, and that is not an oversight about half-finished write-ups: a change the
   * pattern works through often has nothing to justify beyond "nothing it relies on
   * moved", and a field that had to be filled would be filled with that sentence forty
   * times. So a boundary with no reason written is a complete boundary.
   */
  why?: string
  /** The position with this change made. Absent on a point nobody has set up yet. */
  fen?: string
}

export interface PatternEssentials {
  /** 1. How the pieces interact, and what each is responsible for. */
  interactions: EssentialsPoint[]
  /** 2. What in the opponent's position paves the way for it. */
  weaknesses: EssentialsPoint[]
  /** 3a. Realistic changes that would make this combination fail. */
  breaks: EssentialsPoint[]
  /** 3b. Changes it still works through. */
  survives: EssentialsPoint[]
}

/**
 * Your record on one drilled point, and when it is next due.
 *
 * `DrillStat`'s three counters say how you have done; `due` and `streak` say when to ask
 * again. Separate from the game drill's record because it is keyed to a pattern's point
 * rather than to a game's ply, and because that one deliberately has no schedule — it
 * sorts by how badly you are doing, where this one spaces by how well.
 */
export interface PatternDrillStat {
  attempts: number
  correct: number
  lastAt: number
  lastCorrect: boolean
  /** How many right in a row, which is the rung of the interval ladder it sits on. */
  streak: number
  /** When it next comes up. */
  due: number
}

/**
 * An example of a pattern: a game pointed at the move where the idea appears, or a
 * position with the moves played on top of it.
 *
 * When it is a game the whole PGN is kept, not just the position: the moves before the
 * idea are how you recognise when you are heading for it, and the moves after are what
 * it was worth. `startPly` is only where the board opens — you can still step anywhere.
 *
 * `startFen` is the other case, and the common one for a tactic: you have the position
 * and not the game it came from. The moves in `pgn` are then read from there rather than
 * from move one, and a position carrying no moves at all is still a complete example.
 */
export interface PatternLine {
  /** What this line is called — "Catalan opening", "Panov Attack". */
  title: string
  /**
   * Where the line starts, when it is a position rather than a game. Absent means the
   * ordinary starting position, which is every line written before this existed.
   */
  startFen?: string
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
  /**
   * Which tactic it actually is — `fork`, `pin`, `back rank mate`. One of the names
   * `MOTIFS_BY_KIND` offers for this `kind`, and absent where the kind offers none.
   *
   * Not a review tag, though the name is: a name says which idea you reached for, while
   * a motif classifies it, and tagging a mistake `fork` would compete with the write-up
   * you actually wanted to point at.
   */
  motif?: string
  /**
   * The method's answers, when it has been taken apart. Omitted, never undefined.
   *
   * A section of the write-up rather than a document beside it. It was tried as its own
   * type and the first real use split one idea in half — the method in one document and
   * the position in the other, with the name, kind, motif and openings typed twice and
   * nothing keeping them in step. The method internalises *a pattern*, which is what
   * its own name says.
   */
  essentials?: PatternEssentials
  /**
   * How you have done on each of its points, keyed by point id.
   *
   * On the pattern rather than in a collection of its own, the same decision reviews and
   * verdicts make: there are a handful of patterns and they are already read whole, so a
   * record here costs nothing to load. A `merge` write on a map field merges keys, so
   * answering one point never clears the rest.
   */
  drills?: Record<string, PatternDrillStat>
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
  /**
   * When any device last saved it. Stamped by the write, not carried in `planBody`, so a
   * save can never round-trip a stale one — and absent on plans written before it existed.
   *
   * It is what lets an unsaved draft on this device be told apart from an older one: a
   * draft edited before the stored plan was last saved is not newer work, it is work
   * another device has already moved past.
   */
  updatedAt?: number
}

export type NewStudyPlan = Omit<StudyPlan, 'id'>

/**
 * One position to solve, and what you worked out.
 *
 * The solution is a `PatternLine` because that is already exactly what it is: a position
 * with moves played on top of it, branching where the answer depends on the reply, and a
 * comment on any move. Reusing it means the board, the PGN round trip, the variations and
 * the move comments all arrive working rather than being built a second time — and an
 * exercise is the other half of what `startFen` was added for, a position with no game
 * behind it.
 */
export interface Exercise {
  /** Stable, so reordering the sheet never moves a solution onto another position. */
  id: string
  /** Your answer, played from the diagram. `line.title` is what the sheet called it. */
  line: PatternLine
  /** Whether you consider it worked out. Yours to say; nothing checks it. */
  solved: boolean
}

/**
 * A sheet of exercises, usually one handout.
 *
 * The shape a study plan has — a named container of things you work through — for the
 * same reason: it is written once and filled in over days, on whichever device is in
 * front of you.
 */
export interface ExerciseGuide {
  id: string
  name: string
  /** What the set is training: "simulated sacrifices", "rook endings". */
  description: string
  exercises: Exercise[]
  createdAt: number
  /** When any device last saved it, for the same draft comparison a plan makes. */
  updatedAt?: number
  /**
   * Your record on each exercise in the drill, keyed by the exercise's own id.
   *
   * On the guide rather than inside the exercise, which is the shape `drills` and
   * `verdicts` already take on a game: a `merge` write on a map field merges keys, so
   * answering one exercise never clears the rest — and a sheet saved from the editor
   * writes `exercises` without touching this.
   */
  drills?: Record<string, DrillStat>
}

export type NewExerciseGuide = Omit<ExerciseGuide, 'id'>

export interface UserProfile {
  chesscomUsername: string | null
  lichessUsername: string | null
  lastSyncAt: number | null
}

export interface ProviderResponse {
  games: SyncedGame[]
  warnings: string[]
}
