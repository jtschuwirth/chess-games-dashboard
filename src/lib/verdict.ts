import { Chess } from 'chess.js'
import { ENGINE_DEPTH, classifyMove } from './analysis'
import { analyzeLines } from './engine'
import { isFault } from './review'
import type { GameRecord, MoveVerdict, VerdictKind } from '@/types/chess'

/**
 * A second pass over the moves the engine marked, answering a question the first pass
 * cannot: *what kind* of advantage was lost.
 *
 * The first pass says a move cost 4 pawns. It does not say whether you were a rook up
 * and gave it back, or whether the four pawns were a line you had to find and did not.
 * Those are different mistakes with different cures, and a tag table that cannot tell
 * them apart sends you to the wrong training.
 *
 * Three readings decide it, and all three come from the position itself:
 *
 *  - **material** before the move, in pawns. An advantage you are holding.
 *  - **the engine's own score**, which is the advantage you have altogether.
 *  - **how many moves kept it**, which says whether this was a position with one answer
 *    or many.
 *
 * The gap between the second and the first is the part of the advantage that is not
 * material — an attack, two bishops, a passed pawn — and that is the part you have to
 * keep playing for.
 */

/** Pawns, for the material count. The king is not material you can win. */
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Below this the position was not won, so nothing was thrown away. */
export const WINNING = 200

/**
 * How far the score may run ahead of the material before the advantage stops being the
 * material. Two pawns up scoring +2.6 is a material advantage; one pawn up scoring +6.0
 * is a rook ending you still have to win.
 */
export const MATERIAL_SLACK = 150

/**
 * Material that is decisive on its own, whatever else the score is made of.
 *
 * A piece up is a piece up: the attack that takes the score from +3 to +6.8 is a bonus,
 * and losing it is still losing something you were holding. Without this, every
 * advantage with an attack on top of it read as positional — including the one game in
 * this data that was unarguably thrown.
 */
export const DECISIVE_MATERIAL = 3

/**
 * How many candidate moves to ask the engine for.
 *
 * The question is only "one answer or several", so five is plenty and each extra line
 * costs search. When all five hold, `holds` is reported as five and read as "at least".
 */
export const LINES = 5

/** Your material minus theirs, in pawns, in a position. */
export function materialBalance(fen: string, you: 'white' | 'black'): number {
  const board = new Chess(fen).board()

  let mine = 0
  let theirs = 0
  for (const row of board) {
    for (const square of row) {
      if (!square) continue
      if ((square.color === 'w') === (you === 'white')) mine += VALUE[square.type]
      else theirs += VALUE[square.type]
    }
  }
  return mine - theirs
}

/**
 * How many of the engine's candidates would not have been a fault.
 *
 * Measured against the best line of the *same* search, never against the stored
 * `cpBefore`. A MultiPV search prunes less than a plain one and comes back with
 * different numbers for the same position — comparing across the two would be the depth
 * trap in another costume. Within one search the lines are all comparable, which is the
 * whole reason for asking this way.
 */
export function countHolding(scores: number[]): number {
  if (scores.length === 0) return 0

  const best = scores[0]
  return scores.filter(score => !isFault(classifyMove(best, score, false))).length
}

/**
 * What kind of mistake this was.
 *
 * The order matters, and "only one move held" comes first whether or not you were
 * winning. A position with a single answer is a position where the mistake was failing
 * to find it — that is true at +6 and it is true at level, and it is a different failure
 * from picking the worst of five playable moves.
 */
export function readVerdict(input: {
  cpBefore: number
  material: number
  holds: number
}): VerdictKind {
  if (input.holds <= 1) return 'only-move'
  if (input.cpBefore < WINNING) return 'from-level'

  const material = input.material >= DECISIVE_MATERIAL
  const backed = input.cpBefore - input.material * 100 <= MATERIAL_SLACK

  return material || backed ? 'threw-it' : 'lost-the-thread'
}

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  'threw-it': 'threw it',
  'lost-the-thread': 'lost the thread',
  'only-move': 'only move',
  'from-level': 'from level',
}

/** What each one means. The badge is short; this is the sentence behind it. */
export const VERDICT_HINT: Record<VerdictKind, string> = {
  'threw-it': 'You were materially ahead and more than one move kept it.',
  'lost-the-thread':
    'The advantage was the position rather than material, and more than one move kept it. A plan, not a shot.',
  'only-move': 'Exactly one of the moves looked at held. This was a move to find.',
  'from-level': 'Nothing was won here to lose, and more than one move was playable.',
}

/** Following the app: red is a thrown win, violet is the engine's own finding. */
export const VERDICT_BADGE: Record<VerdictKind, string> = {
  'threw-it': 'bg-red-500/15 text-red-300 border-red-500/30',
  'lost-the-thread': 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  'only-move': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  'from-level': 'bg-zinc-700/30 text-zinc-400 border-zinc-700',
}

/** The plies this pass has something to say about: the ones the engine marked. */
export function judgeable(game: GameRecord): number[] {
  return (game.analysis?.moves ?? [])
    .filter(move => isFault(move.tag))
    .map(move => move.ply)
}

/** Verdicts already stored, minus the ones you have thrown out. */
export function verdictsOf(game: GameRecord): Record<string, MoveVerdict> {
  return game.verdicts ?? {}
}

export function verdictAt(game: GameRecord, ply: number): MoveVerdict | null {
  const found = verdictsOf(game)[String(ply)]
  return found && !found.dismissed ? found : null
}

/** What is left to judge: marked moves with no verdict, dismissed or otherwise. */
export function pendingPlies(game: GameRecord): number[] {
  const stored = verdictsOf(game)
  return judgeable(game).filter(ply => !stored[String(ply)])
}

/**
 * Reads one marked move: the position before it, the engine's candidates, and the
 * verdict that falls out of them.
 *
 * `onProgress` is called per move because this is slow enough to need a progress line —
 * one MultiPV search at depth 21 per marked move.
 */
export async function judgeGame(
  game: GameRecord,
  options: { signal?: { stopped: boolean }; onProgress?: (done: number, total: number) => void } = {},
): Promise<Record<string, MoveVerdict>> {
  const marked = (game.analysis?.moves ?? []).filter(move => isFault(move.tag))
  const pending = marked.filter(move => !verdictsOf(game)[String(move.ply)])

  const judged: Record<string, MoveVerdict> = {}

  for (const [index, move] of pending.entries()) {
    if (options.signal?.stopped) break

    // the position the move was played in
    const chess = new Chess()
    let reached = true
    for (let ply = 0; ply < move.ply; ply++) {
      try {
        chess.move(game.moves[ply])
      } catch {
        reached = false
        break
      }
    }
    if (!reached) continue

    const fen = chess.fen()
    const candidates = await analyzeLines(fen, ENGINE_DEPTH, LINES)
    const material = materialBalance(fen, game.color)
    const holds = countHolding(candidates.moves.map(candidate => candidate.cp))

    judged[String(move.ply)] = {
      ply: move.ply,
      material,
      best: candidates.moves[0].cp,
      holds,
      looked: candidates.moves.length,
      verdict: readVerdict({ cpBefore: move.cpBefore, material, holds }),
      depth: candidates.depth,
      judgedAt: Date.now(),
    }

    options.onProgress?.(index + 1, pending.length)
  }

  return judged
}
