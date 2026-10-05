/**
 * What an engine answers with, shared by the one in the browser and the one behind
 * `/api/engine`. Kept apart from both so the server can import it without dragging in
 * Worker code, and the browser without dragging in Node.
 */

/** A forced mate is worth more than any material count; clamp it so arithmetic still works. */
export const MATE_SCORE = 10000

export interface Evaluation {
  /** Centipawns from the perspective of the side to move. */
  cp: number
  depth: number
  bestMoveUci: string
}

/**
 * One of the engine's candidate moves, from a MultiPV search.
 *
 * The scores are all from one search at one depth, which is the only reason they can be
 * compared with each other — asking about each move separately would mean a different
 * search per move, and the same depth trap the whole app avoids.
 */
export interface Candidate {
  /** 1 is the engine's first choice. */
  rank: number
  /** Centipawns from the perspective of the side to move. */
  cp: number
  uci: string
}

/** What a search answers with: the best line, or the best `n` of them. */
export interface Candidates {
  depth: number
  /** Ordered by rank, best first. Never empty. */
  moves: Candidate[]
}

/** The ordinary one-line reading of a search, which is what most callers want. */
export function bestOf(candidates: Candidates): Evaluation {
  const best = candidates.moves[0]
  return { cp: best.cp, depth: candidates.depth, bestMoveUci: best.uci }
}
