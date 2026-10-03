export type Source = 'chesscom' | 'lichess'

export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily'

export type Color = 'white' | 'black'

export type PatternColor = Color | 'any'

export type GameResult = 'win' | 'loss' | 'draw'

export const TIME_CLASSES: TimeClass[] = ['bullet', 'blitz', 'rapid', 'classical', 'daily']

export const SOURCE_LABEL: Record<Source, string> = {
  chesscom: 'Chess.com',
  lichess: 'Lichess',
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
  /** Why the move is a mistake. */
  cause: string
  /** What was visible in the position that should have redirected you. */
  signal: string
  /**
   * Moves you would play instead, in SAN, validated against the position. Not
   * necessarily the engine's first choice — anything that holds the game counts.
   */
  betterMoves: string[]
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

export interface PatternRecord {
  id: string
  name: string
  /** The line exactly as the user typed it. */
  pgn: string
  /** Normalized SAN move list. */
  moves: string[]
  /** FEN fields 1-3 after the last move — what games are matched against. */
  positionKey: string
  ply: number
  color: PatternColor
}

export type NewPattern = Omit<PatternRecord, 'id'>

export interface UserProfile {
  chesscomUsername: string | null
  lichessUsername: string | null
  lastSyncAt: number | null
}

export interface ProviderResponse {
  games: SyncedGame[]
  warnings: string[]
}
