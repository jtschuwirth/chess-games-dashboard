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
  opponentRating: number | null
  userRating: number | null
  eco: string | null
  openingName: string | null
  /** Full move list in SAN. */
  moves: string[]
}

/** A game as stored in Firestore under users/{uid}/games/{id}. */
export interface GameRecord extends SyncedGame {
  /** `chesscom_${uuid}` | `lichess_${id}` — deterministic so re-syncs dedupe. */
  id: string
  /** Excluded from the dataset by the user. Never written by a sync. */
  ignored: boolean
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
