import { Chess } from 'chess.js'
import { ENGINE_DEPTH } from './analysis'
import {
  STANDINGS,
  STANDING_LABEL,
  TRANSITIONS,
  fallBetween,
  holdsMove,
  standingOf,
  type Standing,
} from './bands'
import { analyzeLines } from './engine'
import { isFault } from './review'
import { settings } from './settings'
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
 * What the position asked of you: a line to find, or a choice to get right.
 *
 * These are the two things the old single label was trying to say at once, which is why
 * it read as a muddle — "concrete line" answered how many moves held and "from better"
 * answered where you stood, and they are not alternatives to each other.
 */
export type Breadth = 'concrete' | 'stable'

export function breadthOf(holds: number, config = settings()): Breadth {
  return holds <= config.narrow ? 'concrete' : 'stable'
}

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
 * Whether a candidate keeps you where you were.
 *
 * One line, because it is the same question the classifier asks of the move you played:
 * `holds` in `lib/bands.ts` is "costs no more than an inaccuracy". They used to be two
 * rules in two units, and a move could be marked while this one counted it as holding.
 *
 * Measured against the best line of the *same* search, never against the stored
 * `cpBefore`: a MultiPV search prunes less and comes back with different numbers for the
 * same position, so comparing across the two would be the depth trap in another costume.
 */
export function holdsFrom(best: number, score: number, config = settings()): boolean {
  return holdsMove(best, score, config)
}

/** How many of the engine's candidates held. Never zero: the best move always holds. */
export function countHolding(scores: number[], config = settings()): number {
  if (scores.length === 0) return 0
  return scores.filter(score => holdsFrom(scores[0], score, config)).length
}

/**
 * The descriptor, read off the fall and what the position asked for.
 *
 * The table itself lives in `lib/bands.ts`, beside the severity it also carries: one row
 * says both what a fall costs and what it is called, so the two cannot drift.
 */
export function describe(from: Standing, to: Standing, breadth: Breadth): VerdictKind {
  return fallBetween(from, to)[breadth] as VerdictKind
}

export function readVerdict(
  input: { cpBefore: number; cpAfter: number; holds: number },
  config = settings(),
): VerdictKind {
  return describe(
    standingOf(input.cpBefore, config),
    standingOf(input.cpAfter, config),
    breadthOf(input.holds, config),
  )
}

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  'walked-into-mate': 'walked into mate',
  'missed-the-kill': 'missed the kill',
  'let-the-win-go': 'let the win go',
  'lost-the-thread': 'lost the thread',
  'threw-it': 'threw it',
  'threw-it-away': 'threw it away',
  'missed-the-sharpest': 'missed the sharpest',
  'eased-off': 'eased off',
  'missed-the-follow-up': 'missed the follow-up',
  'let-the-edge-go': 'let the edge go',
  'gave-it-away': 'gave it away',
  'missed-a-chance': 'missed a chance',
  'a-loose-move': 'a loose move',
  'missed-the-line': 'missed the line',
  careless: 'a careless move',
  'missed-the-defence': 'missed the defence',
  'made-it-worse': 'made it worse',
  'let-it-go': 'let it go',
  'missed-the-save': 'missed the save',
  'already-lost': 'already lost',
}

const BREADTH_HINT: Record<Breadth, string> = {
  concrete: 'Only a move or two held, so this was a line to find.',
  stable: 'Several moves held, so this was a choice to get right.',
}

/** The sentence behind a badge: the fall it names, then what the position asked for. */
export function verdictHint(from: Standing, to: Standing, breadth: Breadth): string {
  return `${STANDING_LABEL[from]} → ${STANDING_LABEL[to]}. ${BREADTH_HINT[breadth]}`
}

/**
 * Coloured by where you fell FROM, which is the axis that says how much was at stake.
 * Where you landed and what the position asked for are words beside it - three hues
 * would be three things to decode on a row you scan.
 */
export const STANDING_BADGE: Record<Standing, string> = {
  winning: 'bg-red-500/15 text-red-300 border-red-500/30',
  better: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  level: 'bg-zinc-700/30 text-zinc-400 border-zinc-700',
  worse: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  losing: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  mate: 'bg-zinc-800 text-zinc-500 border-zinc-700',
}

export interface VerdictTally {
  /** Marked moves in the slice, read or not. */
  marked: number
  /** Of those, the ones the second pass has an answer for. */
  read: number
  /** Games holding a marked move nobody has read yet. */
  pending: GameRecord[]
  byVerdict: { kind: VerdictKind; count: number }[]
  byStanding: Record<Standing, { concrete: number; stable: number }>
}

/**
 * What the second pass makes of a whole slice, out of what is already stored.
 *
 * No engine and no search: the verdict is derived from the marked move and the stored
 * `holds`, both of which are on disk. The only thing it cannot invent is a `holds` for a
 * move nobody has read, which is what `pending` counts — the panel says so rather than
 * quietly reporting a share of the moves it happens to know about.
 */
export function verdictTally(games: GameRecord[], config = settings()): VerdictTally {
  const byVerdict = new Map<VerdictKind, number>()
  const byStanding = Object.fromEntries(
    STANDINGS.map(standing => [standing, { concrete: 0, stable: 0 }]),
  ) as VerdictTally['byStanding']

  let marked = 0
  let read = 0
  const pending: GameRecord[] = []

  for (const game of games) {
    const stored = verdictsOf(game, config)
    const faults = (game.analysis?.moves ?? []).filter(move => isFault(move.tag))
    marked += faults.length

    if (faults.some(move => !stored[String(move.ply)])) pending.push(game)

    for (const move of faults) {
      const verdict = stored[String(move.ply)]
      if (!verdict || verdict.dismissed) continue

      read++
      byVerdict.set(verdict.verdict, (byVerdict.get(verdict.verdict) ?? 0) + 1)
      byStanding[standingOf(move.cpBefore, config)][breadthOf(verdict.holds, config)]++
    }
  }

  return {
    marked,
    read,
    pending,
    byStanding,
    byVerdict: [...byVerdict]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
  }
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
export function verdictsOf(game: GameRecord, config = settings()): Record<string, MoveVerdict> {
  const stored = game.verdicts ?? {}
  const analysed = new Map((game.analysis?.moves ?? []).map(move => [move.ply, move]))

  return Object.fromEntries(
    Object.entries(stored).map(([ply, verdict]) => {
      const move = analysed.get(verdict.ply)
      if (!move) return [ply, verdict]

      /*
        The count is re-derived too, from the candidate scores the search stored. It is a
        reading of where the bands fall, and the bands are a setting — a verdict judged
        under one `level` and shown under another would be two different answers wearing
        one number. Older verdicts kept no candidates and keep the count they were given.
      */
      const scores = verdict.candidates?.map(candidate => candidate.cp)
      const holds = scores ? countHolding(scores, config) : verdict.holds

      return [
        ply,
        {
          ...verdict,
          holds,
          candidates: verdict.candidates?.map(candidate => ({
            ...candidate,
            holds: holdsFrom(verdict.candidates![0].cp, candidate.cp, config),
          })),
          verdict: readVerdict(
            { cpBefore: move.cpBefore, cpAfter: move.cpAfter, holds },
            config,
          ),
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
  const config = settings()
  const stored = verdictsOf(game, config)
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
    const candidates = await analyzeLines(fen, ENGINE_DEPTH, config.lines)
    const edge = materialEdge(fen, game.color)
    const material = edge.pawns
    const scores = candidates.moves.map(candidate => candidate.cp)
    const holds = countHolding(scores, config)

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
      return { san, cp: candidate.cp, holds: holdsFrom(best, candidate.cp, config) }
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
      verdict: readVerdict(
        { cpBefore: move.cpBefore, cpAfter: move.cpAfter, holds },
        config,
      ),
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

export { STANDINGS, STANDING_LABEL, TRANSITIONS, standingOf }
export type { Standing }
