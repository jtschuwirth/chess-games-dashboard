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
