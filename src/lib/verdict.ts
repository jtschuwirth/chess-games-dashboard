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

/**
 * The two cuts, read symmetrically from your own side:
 *
 * ```
 *   -300 .. -100   from worse    you were defending
 *   -100 ..  +100  from level    nothing in it either way
 *   +100 ..  +300  from better   an edge, not a win
 *   +300 ..        won           there was something here to throw
 * ```
 *
 * Below -300 a move is not marked at all — see `DECIDED` — so `from worse` covers the
 * whole band where you are worse and still playing.
 *
 * `WINNING` is three pawns rather than two because "threw it" and "lost the thread" are
 * claims about a *won* position, and +2.2 is an edge. Letting them start at two pawns
 * made them the commonest verdicts and the least informative.
 */
export const WINNING = 300

/** A pawn either way. Beyond it you are not playing an even game. */
export const LEVEL = 100

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
 * How few moves may hold before the position counts as having a line rather than a plan.
 *
 * Two, not one: the same idea often has two move orders, or a check that can be given
 * from either of two squares, and a position with one answer written two ways is still a
 * position with one answer.
 */
export const NARROW = 2

/**
 * How many candidate moves to ask the engine for.
 *
 * The question is only "one answer or several", so five is plenty and each extra line
 * costs search. When all five hold, `holds` is reported as five and read as "at least".
 */
export const LINES = 5

/** Your material minus theirs, in pawns, in a position. */
export function materialBalance(fen: string, you: 'white' | 'black'): number {
  return materialEdge(fen, you).pawns
}

/** The figurines, solid-black only — one colour renders the same in every font. */
const GLYPH: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

/** What the pieces are called, so a count can say what it is counting. */
const PIECE_NAME: Record<string, [string, string]> = {
  p: ['pawn', 'pawns'],
  n: ['knight', 'knights'],
  b: ['bishop', 'bishops'],
  r: ['rook', 'rooks'],
  q: ['queen', 'queens'],
}

/** The order they read in, heaviest first — "a rook for a knight", not the other way. */
const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p']

/**
 * What is on the board, your side minus theirs.
 *
 * Both halves are needed and they answer different questions. `pawns` is the weight,
 * which is what the rules here reason about; `by` is what the weight is actually made
 * of, which is what a reader needs — "+3" is a knight to one person and three pawns to
 * another, and those are not the same position.
 */
export function materialEdge(
  fen: string,
  you: 'white' | 'black',
): { pawns: number; by: Record<string, number>; mine: Inventory; theirs: Inventory } {
  const board = new Chess(fen).board()

  const mine: Inventory = {}
  const theirs: Inventory = {}
  let pawns = 0

  for (const row of board) {
    for (const square of row) {
      // the king is on both sides of every position, so it is not material
      if (!square || square.type === 'k') continue

      const ours = (square.color === 'w') === (you === 'white')
      const side = ours ? mine : theirs
      side[square.type] = (side[square.type] ?? 0) + 1
      pawns += ours ? VALUE[square.type] : -VALUE[square.type]
    }
  }

  return { pawns, by: imbalanceOf({ mine, theirs }), mine, theirs }
}

/** What one side has, by piece type. Kings left out; they are not material. */
export type Inventory = Record<string, number>

/** Your count minus theirs, per type, zeroes dropped. */
export function imbalanceOf(pieces: { mine: Inventory; theirs: Inventory }): Record<string, number> {
  const by: Record<string, number> = {}

  for (const type of new Set([...Object.keys(pieces.mine), ...Object.keys(pieces.theirs)])) {
    const diff = (pieces.mine[type] ?? 0) - (pieces.theirs[type] ?? 0)
    if (diff !== 0) by[type] = diff
  }
  return by
}

/**
 * The imbalance of a stored verdict, from the inventory where there is one.
 *
 * Verdicts written before the inventory existed kept only the difference, so that is
 * read as the answer when the boards are not there — the same habit as every other shape
 * here.
 */
export function imbalanceAt(verdict: {
  pieces?: { mine: Inventory; theirs: Inventory }
  materialBy?: Record<string, number>
}): Record<string, number> | undefined {
  return verdict.pieces ? imbalanceOf(verdict.pieces) : verdict.materialBy
}

/**
 * The imbalance as figurines — "♟♟" two pawns up, "♟♟ / ♝" two pawns for a bishop.
 *
 * Pieces rather than a sentence because this sits on a row you scan rather than read,
 * and because the words are a tooltip away. Only the side that is up is drawn, which is
 * what a captured-piece strip shows and is the only part that carries information.
 */
export function materialGlyphs(by: Record<string, number> | undefined): string {
  if (!by) return '?'

  const run = (sign: number) =>
    PIECE_ORDER.filter(type => Math.sign(by[type] ?? 0) === sign)
      .map(type => GLYPH[type].repeat(Math.abs(by[type])))
      .join('')

  const up = run(1)
  const down = run(-1)

  if (!up && !down) return '='
  if (!down) return up
  if (!up) return `– ${down}`
  return `${up} / ${down}`
}

/**
 * The material edge in words: "a rook up", "a knight for two pawns", "level".
 *
 * Written out rather than left as a number because a number cannot say which it is. The
 * two-sided case keeps both halves — being a piece up for two pawns is a different
 * position from being a piece up.
 */
export function materialLabel(by: Record<string, number> | undefined): string {
  if (!by) return 'material unknown'

  const part = (type: string, count: number) => {
    const [one, many] = PIECE_NAME[type] ?? ['piece', 'pieces']
    return count === 1 ? `a ${one}` : `${count} ${many}`
  }

  const up = PIECE_ORDER.filter(type => (by[type] ?? 0) > 0).map(type => part(type, by[type]))
  const down = PIECE_ORDER.filter(type => (by[type] ?? 0) < 0).map(type => part(type, -by[type]))

  if (up.length === 0 && down.length === 0) return 'level'
  if (down.length === 0) return `${up.join(' and ')} up`
  if (up.length === 0) return `${down.join(' and ')} down`
  return `${up.join(' and ')} for ${down.join(' and ')}`
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
 * The order matters, and "hardly anything held" comes first whether or not you were
 * winning. A position with one line in it is a position where the mistake was failing to
 * find that line — that is true at +6 and it is true at level, and it is a different
 * failure from picking the worst of five playable moves.
 */
export function readVerdict(input: {
  cpBefore: number
  material: number
  holds: number
}): VerdictKind {
  if (input.holds <= NARROW) return 'concrete-line'

  if (input.cpBefore < WINNING) {
    if (input.cpBefore < -LEVEL) return 'from-worse'
    if (input.cpBefore > LEVEL) return 'from-better'
    return 'from-level'
  }

  const material = input.material >= DECISIVE_MATERIAL
  const backed = input.cpBefore - input.material * 100 <= MATERIAL_SLACK

  return material || backed ? 'threw-it' : 'lost-the-thread'
}

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  'threw-it': 'threw it',
  'lost-the-thread': 'lost the thread',
  'concrete-line': 'concrete line',
  'from-level': 'from level',
  'from-worse': 'from worse',
  'from-better': 'from better',
}

/** What each one means. The badge is short; this is the sentence behind it. */
export const VERDICT_HINT: Record<VerdictKind, string> = {
  'threw-it': 'You were materially ahead and more than one move kept it.',
  'lost-the-thread':
    'The advantage was the position rather than material, and more than one move kept it. A plan, not a shot.',
  'concrete-line':
    'One or two of the moves looked at held. The position had a line in it to find, not a plan to follow.',
  'from-level':
    'Within a pawn of even, so nothing was won here to lose, and more than one move was playable.',
  'from-worse':
    'You were already worse before this move — defending, not playing an even game — and more than one move was playable.',
  'from-better':
    'An edge rather than a win, between one pawn and three, and more than one move kept it.',
}

/** Following the app: red is a thrown win, violet is the engine's own finding. */
export const VERDICT_BADGE: Record<VerdictKind, string> = {
  'threw-it': 'bg-red-500/15 text-red-300 border-red-500/30',
  'lost-the-thread': 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  'concrete-line': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  'from-level': 'bg-zinc-700/30 text-zinc-400 border-zinc-700',
  // the same muted treatment for all three: they agree nothing was won here, and where
  // you stood is the word rather than the colour
  'from-worse': 'bg-zinc-700/30 text-zinc-400 border-zinc-700',
  'from-better': 'bg-zinc-700/30 text-zinc-400 border-zinc-700',
}

/** The plies this pass has something to say about: the ones the engine marked. */
export function judgeable(game: GameRecord): number[] {
  return (game.analysis?.moves ?? [])
    .filter(move => isFault(move.tag))
    .map(move => move.ply)
}

/**
 * Verdicts as stored, with the judgement re-made from the measurements.
 *
 * The split is the point: what the search cost is kept — how many held, what was on the
 * board, which moves it looked at — and the opinion drawn from it is not. Bands move as
 * the reading of them sharpens (level became a pawn either way; `only-move` became
 * `concrete-line` at two), and re-reading every game to apply a changed opinion would be
 * hours of engine time for numbers already on disk.
 *
 * `cpBefore` lives on the analysed move rather than the verdict, so it is looked up; a
 * verdict whose move has gone keeps whatever it was last given.
 */
export function verdictsOf(game: GameRecord): Record<string, MoveVerdict> {
  const stored = game.verdicts ?? {}
  const analysed = new Map((game.analysis?.moves ?? []).map(move => [move.ply, move]))

  return Object.fromEntries(
    Object.entries(stored).map(([ply, verdict]) => {
      const move = analysed.get(verdict.ply)
      if (!move) return [ply, verdict]

      return [
        ply,
        {
          ...verdict,
          verdict: readVerdict({
            cpBefore: move.cpBefore,
            material: verdict.material,
            holds: verdict.holds,
          }),
        },
      ]
    }),
  )
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
 * Reads the marked moves: the position before each one, the engine's candidates, and the
 * verdict that falls out of them.
 *
 * Skips what has already been read, so stopping half way and coming back resumes.
 * `force` reads them all again, which is what the re-read button is for — a reading
 * written before the code knew how to say something is a reading worth taking again.
 *
 * `onProgress` is called per move because this is slow enough to need a progress line —
 * one MultiPV search at depth 21 per marked move.
 */
export async function judgeGame(
  game: GameRecord,
  options: {
    /** Read every marked move again, rather than only the ones never read. */
    force?: boolean
    signal?: { stopped: boolean }
    onProgress?: (done: number, total: number) => void
  } = {},
): Promise<Record<string, MoveVerdict>> {
  const stored = verdictsOf(game)
  const marked = (game.analysis?.moves ?? []).filter(move => isFault(move.tag))
  const pending = options.force ? marked : marked.filter(move => !stored[String(move.ply)])

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
    const edge = materialEdge(fen, game.color)
    const material = edge.pawns
    const scores = candidates.moves.map(candidate => candidate.cp)
    const holds = countHolding(scores)

    /*
      The candidates are kept, not just counted. The search has already done the work of
      finding them, and "how many held" is the one question that does not answer the one
      you actually have in front of the board, which is what to play instead.
    */
    const best = scores[0]
    const named = candidates.moves.map(candidate => {
      const board = new Chess(fen)
      let san = candidate.uci
      try {
        san = board.move({
          from: candidate.uci.slice(0, 2),
          to: candidate.uci.slice(2, 4),
          promotion: candidate.uci.slice(4, 5) || undefined,
        }).san
      } catch {
        // an unreadable move keeps its coordinates rather than dropping the line
      }
      return {
        san,
        cp: candidate.cp,
        holds: !isFault(classifyMove(best, candidate.cp, false)),
      }
    })

    const reading: MoveVerdict = {
      ply: move.ply,
      material,
      materialBy: edge.by,
      pieces: { mine: edge.mine, theirs: edge.theirs },
      candidates: named,
      best: candidates.moves[0].cp,
      holds,
      looked: candidates.moves.length,
      verdict: readVerdict({ cpBefore: move.cpBefore, material, holds }),
      depth: candidates.depth,
      judgedAt: Date.now(),
    }

    /*
      A re-read refreshes the reading; it does not argue with you about it. The flag is
      only added when it is true: Firestore rejects an `undefined` field value outright,
      so carrying a missing one forward fails the whole write.
    */
    if (stored[String(move.ply)]?.dismissed) reading.dismissed = true

    judged[String(move.ply)] = reading

    options.onProgress?.(index + 1, pending.length)
  }

  return judged
}
