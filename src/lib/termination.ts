import type { GameRecord, Source } from '@/types/chess'

/**
 * One vocabulary for how a game ended. The providers do not share theirs — chess.com
 * says `timeout` where lichess says `outoftime`, and lichess reuses `timeout` to mean
 * a player walked away — so anything counting endings has to normalize first.
 */
export type Ending =
  | 'checkmate'
  | 'resignation'
  | 'flagged'
  | 'abandoned'
  | 'agreement'
  | 'stalemate'
  | 'repetition'
  | 'insufficient'
  | 'other'

const CHESSCOM: Record<string, Ending> = {
  checkmated: 'checkmate',
  resigned: 'resignation',
  timeout: 'flagged',
  abandoned: 'abandoned',
  agreed: 'agreement',
  repetition: 'repetition',
  stalemate: 'stalemate',
  insufficient: 'insufficient',
  '50move': 'insufficient',
  timevsinsufficient: 'insufficient',
  kingofthehill: 'other',
  threecheck: 'other',
  bughousepartnerlose: 'other',
}

const LICHESS: Record<string, Ending> = {
  mate: 'checkmate',
  resign: 'resignation',
  outoftime: 'flagged',
  // lichess uses "timeout" for a player who stopped playing, not one who ran out of clock
  timeout: 'abandoned',
  noStart: 'abandoned',
  draw: 'agreement',
  stalemate: 'stalemate',
  cheat: 'other',
  variantEnd: 'other',
  unknownFinish: 'other',
}

export function normalizeEnding(source: Source, termination: string): Ending {
  const table = source === 'lichess' ? LICHESS : CHESSCOM
  return table[termination] ?? 'other'
}

export function endingOf(game: GameRecord): Ending {
  return normalizeEnding(game.source, game.termination)
}

/** Did the game end with a clock running out, on either site? */
export function isFlagged(game: GameRecord): boolean {
  return endingOf(game) === 'flagged'
}
