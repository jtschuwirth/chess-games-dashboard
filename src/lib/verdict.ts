import { Chess } from 'chess.js'
import { ENGINE_DEPTH } from './analysis'
import {
  BREADTHS,
  BREADTH_LABEL,
  STANDINGS,
  STANDING_LABEL,
  TRANSITIONS,
  fallBetween,
  holdsMove,
  standingOf,
  type Breadth,
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
/**
 * How much room the position gave you.
 *
 * `stable` means everything the search looked at held, so it is read against `looked`
 * rather than against the setting: a position with three legal moves and three holding
 * forgave anything, which is the same thing five of five says.
 */
export function breadthOf(holds: number, looked: number, config = settings()): Breadth {
  if (holds <= config.narrow) return 'sharp'
  return holds >= Math.min(looked, config.lines) ? 'stable' : 'tight'
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
): Material {
  return materialOn(new Chess(fen).board(), you)
}

export interface Material {
  /** The difference in pawn units, from your side. */
  pawns: number
  /** The imbalance, by piece type: what each side has that the other does not. */
  by: Record<string, number>
  mine: Inventory
  theirs: Inventory
}

/** The same reading from a board already in hand, which a replay has on every ply. */
function materialOn(board: ReturnType<Chess['board']>, you: 'white' | 'black'): Material {
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

/**
 * What was on the board at every move of yours, derived rather than stored.
 *
 * The second pass stores material for the moves it reads, which answers "what was on the
 * board when I went wrong" and cannot answer "how often do I go wrong when a piece down"
 * — that needs the same reading for the moves where nothing went wrong, which is most of
 * them. Storing it per move would be the obvious fix and the wrong one: material is a
 * pure function of `game.moves`, which is already on disk, so it is derivable for every
 * game the app has ever seen, including the ones the engine has never looked at. Nothing
 * needs re-running and nothing new is written.
 *
 * One replay per game, keyed by ply — the position *before* that ply, which is the one
 * the move was chosen in. `positionKeyMap` already replays every game on the dashboard
 * for the opening filter, so the cost is known and small.
 */
export function materialByPly(game: GameRecord): Map<number, Material> {
  const chess = new Chess()
  const out = new Map<number, Material>()

  for (let ply = 0; ply < game.moves.length; ply++) {
    out.set(ply, materialOn(chess.board(), game.color))
    try {
      chess.move(game.moves[ply])
    } catch {
      // a game that will not replay stops here; the plies already read are still good
      break
    }
  }

  return out
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
 * The reference it is measured against is `reconcile`'s, not the MultiPV search's own
 * top line — see there for why.
 */
export function holdsFrom(best: number, score: number, config = settings()): boolean {
  return holdsMove(best, score, config)
}

/**
 * How many of the candidates held, against a reference given rather than assumed.
 *
 * It used to take the reference from `scores[0]`, which is the assumption `reconcile`
 * exists to undo. Nearly always still one, since the top line usually carries the
 * reference itself; zero is possible and means the move you played was the search's own
 * first choice and still did not hold, which is worth seeing rather than rounding up.
 */
export function countHolding(
  reference: number,
  scores: number[],
  config = settings(),
): number {
  return scores.filter(score => holdsFrom(reference, score, config)).length
}

/** A candidate as stored: the move, and what the MultiPV search scored it. */
interface Scored {
  san: string
  cp: number
}

export interface Reconciled {
  /** What best play is worth, which is what every candidate is measured against. */
  reference: number
  /** Each candidate's score, in the stored order. */
  scores: number[]
}

/**
 * The candidate scores, with the first pass's dedicated reading used wherever it has one.
 *
 * Both passes search at depth 21 and they do not agree, because MultiPV has to keep five
 * lines alive and so searches each of them less: across 633 marked moves the two readings
 * of the same position differ by a median of 20cp, and in 17% of them they land in
 * different bands. That is what put `better → level · stable 5/5` on one row — the mark
 * came from one number (+101, better) and the breadth from the other (+87, level), with
 * the band edge at 100 sitting between them.
 *
 * The rule now is that a dedicated search beats a shared one. The first pass evaluated
 * two of these positions on their own: the one before your move, which is what best play
 * is worth, and the one after it, which is what your move is worth. Both are depth 21 and
 * both are already stored, so this is a change in how the numbers are read, not in what
 * is measured — every verdict on disk re-reads under it for free.
 *
 * The earlier rule was the opposite, and its reasoning was that comparing numbers across
 * two searches is the depth trap in another costume. That is a real cost and it is still
 * paid here: the remaining candidates keep their MultiPV scores, so the list mixes two
 * searches. It buys the thing that matters more — the move you played is now graded
 * against the same number that marked it, so the two passes cannot contradict each other
 * about it.
 *
 * Direction was the thing worth checking before trusting any of this, because a
 * systematic gap would inflate `sharp` by construction rather than measure it. Between
 * two searches at the same depth it is close to even: median +4cp, single-PV higher in
 * 57% of positions and lower in 37%, and the two land in the same band 93% of the time.
 *
 * `analysisDepth` is what keeps that true. A first pass left at an older, shallower
 * depth is not a better reading of anything — it is the depth trap itself — and the
 * numbers say so loudly: against depth-21 candidates, depth-12 `cpBefore` values ran
 * 54cp low on average and disagreed about the band 29% of the time, against 7% for a
 * matched pair. That is also how the depth-12 analyses still in the data were found, so
 * the guard exists even though nothing carries one today: `ENGINE_DEPTH` has moved once
 * already, and when it moves again every stored analysis is shallow for a while.
 */
export function reconcile(
  move: { san: string; cpBefore: number; cpAfter: number },
  candidates: Scored[],
  analysisDepth: number,
  searchDepth: number,
): Reconciled {
  // a shallower first pass has nothing to contribute: fall back to the search's own line
  if (analysisDepth < searchDepth) {
    return { reference: candidates[0].cp, scores: candidates.map(candidate => candidate.cp) }
  }

  return {
    reference: move.cpBefore,
    scores: candidates.map((candidate, rank) => {
      // the move you played, where the first pass measured the position it led to
      if (candidate.san === move.san) return move.cpAfter
      // the top line is best play, which is what `cpBefore` is the value of
      return rank === 0 ? move.cpBefore : candidate.cp
    }),
  }
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
  input: { cpBefore: number; cpAfter: number; holds: number; looked: number },
  config = settings(),
): VerdictKind {
  return describe(
    standingOf(input.cpBefore, config),
    standingOf(input.cpAfter, config),
    breadthOf(input.holds, input.looked, config),
  )
}

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  'walked-into-mate': 'walked into mate',
  'lost-a-won-game': 'lost a won game',
  'handed-over-a-won-game': 'handed over a won game',
  'lost-it-in-one': 'lost it in one',
  'gave-the-game-away': 'gave the game away',
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
  'slowed-it-down': 'slowed it down',
  'let-it-slip': 'let it slip',
  'turned-it-around': 'turned it around',
  'took-the-slow-road': 'took the slow road',
  'mishandled-the-edge': 'mishandled the edge',
  'lost-the-plot': 'lost the plot',
  drifted: 'drifted',
  'went-the-wrong-way': 'went the wrong way',
  'came-apart': 'came apart',
  'defended-badly': 'defended badly',
  cracked: 'cracked',
  'hung-on-badly': 'hung on badly',
}

export const BREADTH_HINT: Record<Breadth, string> = {
  sharp: 'Only a move or two held, so this was a line to find.',
  tight: 'A few held, so there was room — but not much.',
  stable: 'Everything looked at held, so anything reasonable would have done.',
}

/**
 * Every fall and breadth that is called this.
 *
 * A descriptor is the name of a cell in the transition table, and most of them name
 * exactly one — but not all: `missed the line` is what a sharp fall out of level is
 * called whether it lands in worse or in losing, `gave it away` is said of a stable fall
 * from better and of one from level, and `walked into mate` is said of all of them. So a
 * descriptor's recipe is a list rather than a value, and this is what builds it.
 */
export interface Recipe {
  from: Standing
  /** The landings this row covers, as a fault can actually reach them. */
  to: Standing[]
  /** The breadths of that row carrying this name — all three where they agree. */
  breadths: Breadth[]
}

/**
 * The landings worth naming: a marked move never leaves you better off than you were,
 * so the half of each row that exists only to make the table total says nothing to a
 * reader. `losing → winning or better or level or worse or losing` is `losing → losing`.
 */
function landings(fall: (typeof TRANSITIONS)[number]): Standing[] {
  const ceiling = STANDINGS.indexOf(fall.from)
  const reachable = fall.to.filter(to => STANDINGS.indexOf(to) <= ceiling)
  return reachable.length > 0 ? reachable : fall.to
}

/** Built once: seventeen rows against at most thirty-two names. */
const RECIPES = ((): Map<VerdictKind, Recipe[]> => {
  const out = new Map<VerdictKind, Recipe[]>()

  for (const fall of TRANSITIONS) {
    const breadthsByKind = new Map<string, Breadth[]>()
    for (const breadth of BREADTHS) {
      breadthsByKind.set(fall[breadth], [...(breadthsByKind.get(fall[breadth]) ?? []), breadth])
    }

    for (const [kind, breadths] of breadthsByKind) {
      const key = kind as VerdictKind
      out.set(key, [...(out.get(key) ?? []), { from: fall.from, to: landings(fall), breadths }])
    }
  }

  return out
})()

export function recipesFor(kind: VerdictKind): Recipe[] {
  return RECIPES.get(kind) ?? []
}

/**
 * What a descriptor is the name of, written out: `sharp · level → worse`.
 *
 * It belongs in a tooltip rather than on the row. Nearly every descriptor has one
 * recipe, but `walked into mate` has five, and a list that printed them all would be
 * four lines of noise on every other row to serve the one that needs it.
 */
function recipeLine(recipe: Recipe): string {
  const breadth =
    recipe.breadths.length === BREADTHS.length
      ? 'any'
      : recipe.breadths.map(entry => BREADTH_LABEL[entry]).join(' or ')
  const landed = recipe.to.map(entry => STANDING_LABEL[entry]).join(' or ')
  return `${breadth} · ${STANDING_LABEL[recipe.from]} → ${landed}`
}

export function verdictRecipe(kind: VerdictKind): string {
  return recipesFor(kind).map(recipeLine).join('\n')
}

/**
 * The recipe, with your own count against each band where that is not ambiguous.
 *
 * A descriptor that spans two bands — `gave it away` is said of a stable fall from
 * better and of one from level — raises the question the recipe alone cannot answer:
 * which of them were yours. The tally knows, so the line says so. Where a single band
 * covers two of the lines, as `missed the line` does for level, the count is left off
 * rather than printed twice: the row's own figure already covers both.
 */
export function verdictTooltip(
  kind: VerdictKind,
  byStanding: Partial<Record<Standing, number>> = {},
): string {
  const recipes = recipesFor(kind)
  const bands = new Set(recipes.map(recipe => recipe.from))
  const countable = bands.size === recipes.length && bands.size > 1

  const lines = recipes.map(recipe => {
    // a band you have no readings from keeps its line and loses the figure: the recipe
    // is what the descriptor is, and "— 0" five times over is not worth reading
    const count = countable ? (byStanding[recipe.from] ?? 0) : 0
    return `${recipeLine(recipe)}${count > 0 ? ` — ${count}` : ''}`
  })

  return `${VERDICT_LABEL[kind]}\n${lines.join('\n')}`
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

/**
  * The same scale as plain ink, for the places a pill would be a pill inside a pill.
  *
  * A filter chip is already a bordered pill, and putting `STANDING_BADGE` inside one gave
  * two borders round three words of 10px uppercase — and on an *active* chip, which is
  * light, a `bg-red-500/15 text-red-300` badge is very nearly invisible. The hues are the
  * badge's own, so a chip and the row it filters to still read as the same thing.
  */
export const STANDING_INK: Record<Standing, string> = {
  winning: 'text-red-300',
  better: 'text-amber-200',
  level: 'text-zinc-400',
  worse: 'text-sky-300',
  losing: 'text-zinc-500',
  mate: 'text-zinc-500',
}

/** A bar in the same hue as that badge, so the two halves of the panel read as one. */
export const STANDING_BAR: Record<Standing, string> = {
  winning: 'bg-red-500/50',
  better: 'bg-amber-500/50',
  level: 'bg-zinc-400/40',
  worse: 'bg-sky-500/50',
  losing: 'bg-zinc-600',
  mate: 'bg-zinc-600',
}

export interface VerdictTally {
  /** Marked moves in the slice, read or not. */
  marked: number
  /** Of those, the ones the second pass has an answer for. */
  read: number
  /** Games holding a marked move nobody has read yet. */
  pending: GameRecord[]
  /** Each descriptor, with the bands its readings fell from — usually just the one. */
  byVerdict: { kind: VerdictKind; count: number; byStanding: Record<Standing, number> }[]
  byStanding: Record<Standing, Record<Breadth, number>>
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
  const byVerdict = new Map<VerdictKind, Record<Standing, number>>()
  const byStanding = Object.fromEntries(
    STANDINGS.map(standing => [standing, { sharp: 0, tight: 0, stable: 0 }]),
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
      const from = standingOf(move.cpBefore, config)

      const seen =
        byVerdict.get(verdict.verdict) ??
        (Object.fromEntries(STANDINGS.map(standing => [standing, 0])) as Record<Standing, number>)
      seen[from]++
      byVerdict.set(verdict.verdict, seen)

      byStanding[from][breadthOf(verdict.holds, verdict.looked, config)]++
    }
  }

  return {
    marked,
    read,
    pending,
    byStanding,
    byVerdict: [...byVerdict]
      .map(([kind, counts]) => ({
        kind,
        count: STANDINGS.reduce((sum, standing) => sum + counts[standing], 0),
        byStanding: counts,
      }))
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
      const read = verdict.candidates
        ? reconcile(move, verdict.candidates, game.analysis?.depth ?? 0, verdict.depth)
        : null
      const holds = read ? countHolding(read.reference, read.scores, config) : verdict.holds
      const looked = read ? read.scores.length : verdict.looked

      return [
        ply,
        {
          ...verdict,
          holds,
          looked,
          // the scores go out reconciled as well, so the list on screen is the list the
          // count was taken from rather than a second opinion sitting beside it
          candidates: verdict.candidates?.map((candidate, rank) => ({
            ...candidate,
            cp: read ? read.scores[rank] : candidate.cp,
            holds: read ? holdsFrom(read.reference, read.scores[rank], config) : candidate.holds,
          })),
          verdict: readVerdict(
            { cpBefore: move.cpBefore, cpAfter: move.cpAfter, holds, looked },
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
    /*
      The candidates are kept, not just counted. The search has already done the work of
      finding them, and "how many held" is the one question that does not answer the one
      you actually have in front of the board, which is what to play instead.

      Named before they are scored, because `reconcile` finds the move you played by its
      SAN — and the search only knows it as coordinates.
    */
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
      return { san, cp: candidate.cp }
    })

    const read = reconcile(move, named, game.analysis?.depth ?? 0, candidates.depth)
    const holds = countHolding(read.reference, read.scores, config)
    const scored = named.map((candidate, rank) => ({
      ...candidate,
      holds: holdsFrom(read.reference, read.scores[rank], config),
    }))

    const reading: MoveVerdict = {
      ply: move.ply,
      material,
      materialBy: edge.by,
      pieces: { mine: edge.mine, theirs: edge.theirs },
      candidates: scored,
      // the search's own top line, kept as the measurement it is: `reconcile` replaces
      // it on read, and a stored number nobody can get back to is a number lost
      best: candidates.moves[0].cp,
      holds,
      looked: candidates.moves.length,
      verdict: readVerdict(
        { cpBefore: move.cpBefore, cpAfter: move.cpAfter, holds, looked: read.scores.length },
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

export { BREADTHS, BREADTH_LABEL, STANDINGS, STANDING_LABEL, TRANSITIONS, standingOf }
export type { Breadth, Standing }
