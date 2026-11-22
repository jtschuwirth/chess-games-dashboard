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

/**
 * What a colour is called on screen, wherever one is named.
 *
 * `White`, not `As White`. The filter chips, the result cards under them and the badge
 * on a saved line all answer "which colour", and three of them said it three ways — so
 * narrowing to `as White` and then reading a card called `As White` was the same word
 * twice in two spellings. A label names a thing; the sentence around it supplies the
 * preposition, which is why nothing here reads as prose.
 */
export const COLOR_LABEL: Record<OpeningColor, string> = {
  any: 'Either colour',
  white: 'White',
  black: 'Black',
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
  /**
   * What you actually typed, when the line is not all of it.
   *
   * A row used to be dropped on save unless its moves parsed — so writing the reason
   * first, or mistyping one move of six, threw the whole row away with the sentence in
   * it, having flagged the problem in the form and then said nothing about discarding
   * it. The same bargain the pattern form makes with a PGN that will not read: keep
   * what was written, say what is wrong with it, and let it be fixed.
   *
   * Set only when it differs from `line`, so a row that parses cleanly stores nothing
   * extra and every row written before this reads back exactly as it did.
   */
  text?: string
  /**
   * A line you looked at and ruled out, rather than one you would play.
   *
   * "Nc6 does not work, they have Bxd4" is as much a part of a post-mortem as the move
   * you should have found — it is the half of the calculation you got right — and
   * there was nowhere to put it. Written into the alternatives it was worse than
   * nowhere: the drill accepts anything you wrote down as *your* answer, so a line you
   * had rejected came back marked correct.
   *
   * Absent means a line you would play, which is what every row written before this
   * was. The engine's reading is unchanged either way — it is a fact about the moves,
   * not about what you meant by writing them down.
   */
  rejected?: boolean
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

export type PatternKind = 'tactics' | 'mate' | 'strategy' | 'opening' | 'endgame'

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
  /**
   * How this one went.
   *
   * A count says you did the thing and cannot say what came of it: "solve the Yusupov
   * test ×1" is ticked the same whether you scored 6 or 22. The day's own note is the
   * wrong place for it, because a day holds several tasks and what you have to say
   * belongs to one of them — and it is as long as it needs to be, the same box the day
   * gets rather than a line for a figure.
   *
   * It belongs to **this day's instance** of the task, not to the task as the plan
   * states it, so a new week built from the template starts without one — the same reset
   * `done` gets, and for the same reason. It travels with the task when it is dragged to
   * another day, because it is the task's.
   *
   * Optional and absent rather than empty: an `undefined` field rejects the whole
   * document, and an empty string on every task of every day of twelve weeks is a
   * thousand keys saying nothing.
   */
  note?: string
  /**
   * Said not to have happened, rather than merely not ticked.
   *
   * An untouched task and one you deliberately skipped look identical on a day you have
   * not opened — both read `0 of 2` — so there was no way to write down the evening that
   * disappeared. Marking it is also what makes a template day **real**: a day reaches the
   * document once something on it has been said, and "I did not do this" is as much a
   * thing to say as having done it.
   *
   * Absent rather than false, the rule every optional field here follows.
   */
  missed?: boolean
}

/** A day of a study plan: what to do, how it went, and what you wrote up. */
export interface PlanDay {
  tasks: PlanTask[]
  /** Anything about the day itself — how it felt, what to carry into tomorrow. */
  note: string
}

/** One day of the template: what that position in a week asks for. */
export interface PlanTemplateDay {
  tasks: PlanTask[]
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
  /**
   * The week every other week is shown through, which is a screen and not a stretch of
   * days.
   *
   * A plan is the same handful of tasks on most days — two rapid games on a Monday, a
   * chapter on a Tuesday — and typing them into eighty-four days is why a plan does not
   * get written down. So one week says what each weekday asks for, every day is drawn
   * from the entry at its own position, and **none of it is stored on a day** until that
   * day is touched.
   *
   * By position, not by calendar weekday: a plan's weeks are consecutive seven-day
   * blocks from `startDate`, so position 0 is always the same weekday, and the position
   * is what the plan's own shape is already counted in. The screen reads the weekday off
   * `startDate` and prints it, which is how you think about it without the data having
   * to know.
   *
   * One entry per day, each an object holding that day's list — **not** a list of
   * lists. Firestore refuses an array directly inside an array and rejects the whole
   * document for it, which is what `PlanTask[][]` did on the first save that carried a
   * template: *"Nested arrays are not supported"*. Wrapping each day in an object is
   * the standard way round it and is the shape a week already has, where a day is an
   * object with `tasks` on it.
   *
   * Absent on every plan written before it existed, and absent rather than empty when
   * nothing is in it.
   */
  template?: PlanTemplateDay[]
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

/* ------------------------------------------------------------- daily games */

/**
 * One step of the move loop, and the whole failure vocabulary.
 *
 * The ids are the point: a post-mortem files what went wrong under the step that was
 * supposed to catch it, so "step 2 never listed their loose bishop" is countable where
 * "that move was bad" is not. They read as tags because that is what they will become.
 *
 * The table they come from is `METHOD_PASSES` in `lib/daily.ts`, the habit
 * `STUDY_PANELS` and `ESSENTIALS_SECTIONS` already follow — the screen that explains
 * the method renders the same table the form asks from, so a step cannot be asked on one
 * and missing from the other.
 */
export type MoveStepId =
  | 'book'
  | 'material'
  | 'threats'
  | 'candidates'
  | 'side'
  | 'fantasy'
  | 'plan-choice'
  | 'blunder-check'

/**
 * What you wrote before playing one move.
 *
 * Keyed by the ply it produced — `logs['6']` is the thinking behind the seventh
 * half-move of the game — so a log is tied to a move rather than to where it sits in a
 * list, and entering a move you forgot earlier never re-files the rest.
 */
export interface MoveLog {
  /** Index of the move this produced: how many half-moves were on the board. */
  ply: number
  /**
   * Whether Pass 1 found something concrete that survives their best reply.
   *
   * The gate, and the reason it is a boolean rather than a number: it decides whether
   * the position is quiet, and "did I find something" is a question you can answer where
   * "is this roughly equal" is the thing you are trying to learn to answer.
   */
  concrete: boolean
  /**
   * What you think the position is worth, in pawns, **from White's side**.
   *
   * White's because that is the frame every board, readout and engine panel in the app
   * shows; the stored analysis is in your own frame and converts at the point of display.
   * Written on every move, not only quiet ones — it is the one field that scores against
   * the engine with no interpretation at all.
   */
  evaluation: number | null
  /**
   * The line the evaluation is the value of.
   *
   * Without it a disagreement with the engine is unattributable. With it there are two
   * different findings: the line was wrong, which is calculation, or the line was right
   * and its final position is not worth what you said, which is judgement.
   */
  line: string
  /** One answer per step of the loop, by step id. Steps you skipped are absent. */
  answers: Partial<Record<MoveStepId, string>>
  /** How long you spent on it, in minutes. Yours to write; nothing times you. */
  minutes?: number
  /**
   * Which step should have caught it, written afterwards against the engine.
   *
   * The whole reason the loop is recorded move by move. Absent means nobody has filed
   * this move yet, which is told from `none` — a move no step of the loop would have
   * caught — the way an unanswered question is told from one answered with nothing.
   */
  failed?: MoveFailureId
  /** What to do differently, in your own words. */
  lesson?: string
}

/**
 * What a move is filed under in the post-mortem.
 *
 * The eight steps, plus two things that are failures and are not steps.
 *
 * `gate` is the branch going the wrong way: a quiet position you read as having
 * something concrete in it, or a tactic you had and talked yourself out of. It has no
 * box on the form because it is a chip rather than a question, and it is very likely the
 * most interesting row this will ever produce — so leaving it out of the vocabulary
 * would force the most structural failure in the method to be filed as something else.
 *
 * `none` is the escape hatch, and it earns its place the same way the review form's
 * "hard to find" does: it is the conclusion you reach *after* trying to name the step
 * and finding there is not one. It is stored and then left out of every tally, so a move
 * nothing would have caught can never read as a step that failed.
 */
export type MoveFailureId = MoveStepId | 'gate' | 'none'

/**
 * A game played slowly on purpose, with the thinking written down move by move.
 *
 * Its own collection rather than a field on a game, because a game in progress has no
 * finished move list — and an uploaded game's id is hashed from its moves, so there is
 * nothing stable to hang the log on until the game is over. The two are joined by
 * `gameId` once it has been brought in.
 */
export interface DailyGame {
  id: string
  /** Who you are playing. */
  opponent: string
  /** Where the game lives, so you can get back to it in one press. */
  url?: string
  color: Color
  /** The moves so far, exactly as entered. The authority; `moves` is parsed from it. */
  pgn: string
  moves: string[]
  /** What you wrote before each of your moves, keyed by ply. */
  logs: Record<string, MoveLog>
  /**
   * The ply your preparation ran out at: the first move you had to find yourself.
   *
   * On the game rather than on each log, because a game leaves book **once** — there is
   * no coming back to it, so a flag per move would be a hundred copies of one fact and
   * a hundred chances for them to disagree. Absent means you have not said yet, which
   * reads as still in book: that is true at the start of every game, and the control to
   * end it is on the move where you notice.
   */
  leftBookAt?: number
  /** Whether it is still being played. */
  finished: boolean
  result?: GameResult
  /** The synced or uploaded game this became, once it has been brought in. */
  gameId?: string
  /** What the whole game taught you, written at the end. */
  note: string
  createdAt: number
  /** When any device last saved it, for the draft comparison a plan makes. */
  updatedAt?: number
}

export type NewDailyGame = Omit<DailyGame, 'id'>

/* ------------------------------------------------------------------- studies */

/**
 * What kind of thing a study is about. Deliberately short, the rule a pattern's kind
 * already follows: a study you cannot file under one of these is usually two studies.
 *
 * The split that matters is the first two. An **opening** study is about a move order —
 * it names saved lines and its games are the ones that reached them. A **structure**
 * study is about a position type that several openings run into, which is why the Panov
 * and the Queen's Gambit both point at one isolated-queen's-pawn study rather than each
 * writing it out.
 */
export type StudyKind = 'opening' | 'structure' | 'endgame' | 'theme'

/**
 * Another study this one runs into — "this line of the Panov enters the IQP".
 *
 * One-directional and stored on the study that leads *in*, because that is where the
 * sentence is written: the note says which line reaches it. The other end is derived by
 * reading the handful of studies there are, so the IQP study lists every opening that
 * arrives at it with nothing stored twice and no second place to be wrong.
 */
export interface StudyRef {
  studyId: string
  /** Why it is here: the line, or the moment, that leads into it. */
  note?: string
}

/**
 * A model game under a study, opened where the study wants it.
 *
 * `ply` is the whole point of the reference rather than a convenience: a model game is
 * cited for the structure it reaches, so the board opens on the move the study is about
 * — move 11, where the pawn is taken and the isolani appears — and not on move one.
 * Absent falls back to the game's own `startPly`, which is where its author pointed it.
 */
export interface ModelGameRef {
  /** A `ModelGame` id. */
  gameId: string
  ply?: number
  note?: string
}

/**
 * One study: what you know about an opening, a structure, an ending or a theme.
 *
 * The prose is an `OpeningStudy` body — the same ideas and links an opening write-up
 * already used, so the sections, the idea rows and the link cards all arrive working.
 * Everything else is a list of ids into collections that already exist: the saved lines
 * it covers, the patterns that apply here, the studies it leads into, the model games
 * showing it played. Nothing is a second copy of anything, which is the rule the opening
 * study page was built on and the reason this one can be composed rather than written
 * out.
 */
export interface StudyRecord {
  id: string
  name: string
  kind: StudyKind
  /** Which side you study it from. `any` for a structure both sides meet. */
  color: OpeningColor
  /** One line saying what the study is for — what the finder reads under the name. */
  description: string
  /** Saved opening lines this study covers, by `OpeningLine` id. */
  openingIds: string[]
  /**
   * Patterns that apply here, by `PatternRecord` id.
   *
   * Stored on the study, which is the opposite of the opening study's own link — that
   * one lives on the pattern as `openingIds`, because the pattern form had it first. A
   * study is not an opening, so there is no field on a pattern to read, and one answer
   * in one place is the point.
   */
  patternIds: string[]
  /** Studies this one runs into. */
  related: StudyRef[]
  /** Model games showing it, each pointed at the move it is cited for. */
  games: ModelGameRef[]
  /** The written part: the ideas and the links. */
  body: OpeningStudy
  createdAt: number
  /** When any device last saved it, for the draft comparison a plan makes. */
  updatedAt?: number
}

export type NewStudyRecord = Omit<StudyRecord, 'id'>

/* --------------------------------------------------------------- model games */

/** How a PGN writes a result, which is what a game somebody else played carries. */
export type PgnResult = '1-0' | '0-1' | '1/2-1/2' | '*'

/**
 * A game somebody else played, brought in to study.
 *
 * Its own collection rather than a `GameRecord` with `source: 'upload'`, and that is the
 * whole decision here: an uploaded game is **yours** — it counts in every slice, every
 * split and every rating pool, because `any` means any — and Karpov's games are not your
 * record. Storing them there would put a hundred games you never played into the figure
 * that answers how you are doing.
 *
 * The game itself is a `PatternLine`, because that is already exactly what it is: a PGN
 * kept whole, the moves parsed off it, where the board opens, which way round to read it
 * and a comment on any move. `line.title` and `line.note` are unused — the players name
 * the game and `description` says what it was about — so that the two can never give two
 * answers.
 */
export interface ModelGame {
  id: string
  white: string
  black: string
  /** Where it was played. Empty where the PGN did not say. */
  event: string
  /** Four digits, read off the PGN's `Date`. Absent where it could not be. */
  year?: number
  result: PgnResult
  /** What the game was about, so the list says why it is here. */
  description: string
  /** The game: its PGN, moves, opening ply, orientation and per-move commentary. */
  line: PatternLine
  createdAt: number
  /** When any device last saved it, for the draft comparison a plan makes. */
  updatedAt?: number
}

export type NewModelGame = Omit<ModelGame, 'id'>
