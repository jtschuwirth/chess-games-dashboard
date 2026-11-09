import { Chess } from 'chess.js'
import { normalizeStudy } from './study'
import {
  COLOR_LABEL,
  type AltLine,
  type GameRecord,
  type NewOpeningLine,
  type OpeningColor,
  type OpeningLine,
} from '@/types/chess'

/**
 * How deep into a game we look for the opening position. Openings transpose long
 * before move 30, and this bounds the replay cost when a few hundred games load.
 */
export const MAX_OPENING_PLY = 60

/**
 * Piece placement + side to move + castling rights: the first three FEN fields.
 * Dropping the move counters is what lets a transposition match; dropping the
 * en-passant square avoids a spurious mismatch between the same position reached
 * with and without a double pawn push.
 */
export function positionKey(fen: string): string {
  const [placement, turn, castling] = fen.split(' ')
  return `${placement} ${turn} ${castling}`
}

export interface ParsedOpening {
  moves: string[]
  positionKey: string
  ply: number
}

/** Turns a pasted line like "1. e4 c6 2. d4 d5" into moves + the position it reaches. */
export function parseOpening(pgn: string): ParsedOpening {
  const chess = new Chess()

  try {
    chess.loadPgn(pgn.trim())
  } catch {
    throw new Error('Invalid PGN — check the move notation and try again.')
  }

  const moves = chess.history()
  if (moves.length === 0) {
    throw new Error('That line has no moves — an empty opening would match every game.')
  }

  return { moves, positionKey: positionKey(chess.fen()), ply: moves.length }
}

/**
 * Every position the game passed through, and the half-move it first stood there.
 *
 * It was a `Set` and could only answer whether a position was reached, never when — so
 * two saved openings both matching a game said nothing about which came first, which is
 * the whole of "this was a Queen's Gambit that became a Panov". A `Map` answers `.has`
 * exactly as a `Set` does, so this cost nothing at the call sites that only ask that.
 *
 * The first ply wins on a repetition: you reached the position when you first stood in
 * it, not when you wandered back through it on move 30.
 */
export type GameKeys = Map<string, number>

export function gamePositionKeys(moves: string[], limitPly: number = MAX_OPENING_PLY): GameKeys {
  const chess = new Chess()
  const keys: GameKeys = new Map()
  const end = Math.min(moves.length, limitPly)

  for (let i = 0; i < end; i++) {
    try {
      chess.move(moves[i])
    } catch {
      break // corrupt move list — keep whatever we replayed successfully
    }
    const key = positionKey(chess.fen())
    if (!keys.has(key)) keys.set(key, i + 1)
  }

  return keys
}

/** The main line and every alternate, as the lines they are. */
export function openingLines(opening: OpeningLine): AltLine[] {
  const main: AltLine = {
    pgn: opening.pgn,
    moves: opening.moves,
    positionKey: opening.positionKey,
    ply: opening.ply,
  }
  return [main, ...(opening.alts ?? [])]
}

export function gameMatchesOpening(
  game: GameRecord,
  keys: GameKeys,
  opening: OpeningLine,
): boolean {
  if (opening.color !== 'any' && game.color !== opening.color) return false
  return opening.keys.some(key => keys.has(key))
}

/**
 * The half-move at which the game first stood in any of this opening's positions, or
 * null when it never did. Colour is not checked here — `gameMatchesOpening` owns that.
 */
export function reachedAt(keys: GameKeys, opening: OpeningLine): number | null {
  let first: number | null = null
  for (const key of opening.keys) {
    const ply = keys.get(key)
    if (ply !== undefined && (first === null || ply < first)) first = ply
  }
  return first
}

/** ["e4","c6","d4"] -> "1. e4 c6 2. d4" */
export function formatMoves(moves: string[]): string {
  return moves
    .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san))
    .join(' ')
}

/* ------------------------------------------------------- variation tree */

export interface OpeningNode {
  opening: OpeningLine
  children: OpeningNode[]
  depth: number
}

/** True when `parent` is a strict move-prefix of `child` — 1.e4 c6 is a parent of 1.e4 c6 2.d4 d5. */
export function isParentLine(parent: string[], child: string[]): boolean {
  if (parent.length >= child.length) return false
  return parent.every((san, index) => san === child[index])
}

const COLOR_SUFFIX: Record<OpeningColor, string> = {
  any: '',
  white: ` (${COLOR_LABEL.white})`,
  black: ` (${COLOR_LABEL.black})`,
}

/** "Caro-Kann (Black)" — what tells two same-line repertoires apart on screen. */
export function openingLabel(opening: OpeningLine): string {
  return opening.name + COLOR_SUFFIX[opening.color]
}

/**
 * Whether `parent` may adopt `child`. A line only joins a repertoire of the same
 * colour: the Panov Attack saved as White must not land under a Caro-Kann saved as
 * Black. A colour-agnostic parent takes anything, since its own totals already cover
 * both sides; the reverse would widen the parent past the colour it was saved with.
 */
export function canNest(
  parent: { color: OpeningColor },
  child: { color: OpeningColor },
): boolean {
  return parent.color === 'any' || parent.color === child.color
}

/**
 * Nests saved lines by move prefix: a line whose moves continue another saved line of
 * the same colour becomes its sub-variation, under the deepest such line. Transpositions
 * into a different opening are not considered here — only the literal move order.
 */
export function buildOpeningTree(openings: OpeningLine[]): OpeningNode[] {
  const shortestFirst = [...openings].sort(
    (a, b) => a.ply - b.ply || a.name.localeCompare(b.name),
  )
  const placed: OpeningNode[] = []
  const roots: OpeningNode[] = []

  for (const opening of shortestFirst) {
    const node: OpeningNode = { opening, children: [], depth: 0 }

    let parent: OpeningNode | null = null
    for (const candidate of placed) {
      if (!isParentLine(candidate.opening.moves, opening.moves)) continue
      if (!canNest(candidate.opening, opening)) continue

      if (!parent || candidate.opening.ply > parent.opening.ply) {
        parent = candidate
      } else if (
        candidate.opening.ply === parent.opening.ply &&
        candidate.opening.color === opening.color &&
        parent.opening.color !== opening.color
      ) {
        // same line saved both ways: the one matching this colour wins over the agnostic one
        parent = candidate
      }
    }

    if (parent) {
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }

    placed.push(node)
  }

  return roots
}

/** Depth-first order, which is what the dropdown and the list want. */
export function flattenTree(nodes: OpeningNode[]): OpeningNode[] {
  return nodes.flatMap(node => [node, ...flattenTree(node.children)])
}

/** A node's own line plus every sub-variation below it. */
export function subtreeOpenings(node: OpeningNode): OpeningLine[] {
  return [node.opening, ...node.children.flatMap(subtreeOpenings)]
}

/**
 * A game belongs to a variation when it reached that line or any of its
 * sub-variations — so a parent's totals always cover its children.
 */
export function gameMatchesNode(game: GameRecord, keys: GameKeys, node: OpeningNode): boolean {
  return subtreeOpenings(node).some(opening => gameMatchesOpening(game, keys, opening))
}

/* --------------------------------------------------------- how a game got here */

export interface Arrival {
  node: OpeningNode
  /** Half-moves played when the game first stood in one of this opening's positions. */
  ply: number
  /**
   * Whether the game played this opening's **main** move order to get there.
   *
   * The main line and not any of the other ways in, which is the whole point and was
   * got wrong first: once the Queen's Gambit route into the Panov is written down as a
   * Panov line, a game playing it would count as having played the Panov and the route
   * would stop saying where it came from — silencing exactly the thing the alternates
   * were added to catch. Writing a transposition down does not stop it being one; it
   * makes it one you know about.
   */
  played: boolean
  /**
   * The lines this one is nested under that the game never stood in — the rest of its
   * name, which a transposition into a sub-variation otherwise leaves unsaid.
   *
   * `5. c3` is a child of `with 4.Nf3`, and a game that plays 4.c3 and only then Nf3
   * lands in it without ever standing in its parent. The route had nothing to say about
   * that, so it read `Caro Kann › Exchange Variation → 5. c3` — and the arrow was in the
   * wrong place twice over: the Caro-Kann and the Exchange were played normally, and the
   * thing after the arrow is half a name. Which 5.c3? The one under 4.Nf3, which is the
   * only part of the whole line that *is* different.
   *
   * Empty on an arrival the game played into, always: playing a line's own moves means
   * standing in every position above it, so its ancestors are arrivals in their own
   * right. It fills only where a transposition skipped a level.
   */
  under: OpeningNode[]
}

/**
 * Every saved opening the game actually reached, in the order it reached them.
 *
 * This replaced `matchingPath`, which asked `gameMatchesNode` — the **subtree** test —
 * and so named parents the game had never been anywhere near. A Panov reached through a
 * Queen's Gambit move order read `Caro Kann › Exchange Variation › Panov Attack`,
 * because the Panov sits under the Caro-Kann in the tree and a parent matches whenever
 * any child does. That roll-up is right for counting, where a parent's totals have to
 * cover its children, and flatly wrong for naming: the game never played 1.e4 c6.
 *
 * So each node is tested against its own positions, and the result is sorted by when the
 * game got there rather than by where the node sits. A normal game comes out exactly as
 * it did before, because it really did pass through every line on its chain.
 *
 * What it cannot drop is the **name** of a line it did reach. A sub-variation is named by
 * its chain, so an arrival whose parents were skipped carries them in `under` — unreached,
 * and still part of what the thing is called. Each one is spelled out once: an ancestor
 * already in the route, or already written out under an earlier arrival, is not repeated.
 */
export function openingRoute(nodes: OpeningNode[], game: GameRecord, keys: GameKeys): Arrival[] {
  const arrivals: Arrival[] = []

  for (const node of flattenTree(nodes)) {
    if (!gameMatchesOpening(game, keys, node.opening)) continue
    const ply = reachedAt(keys, node.opening)
    if (ply === null) continue

    arrivals.push({
      node,
      ply,
      played: node.opening.moves.every((san, index) => game.moves[index] === san),
      under: [],
    })
  }

  // when two lines name the same position, the longer one is the more specific thing
  // to have reached, so it reads second
  arrivals.sort(
    (a, b) =>
      a.ply - b.ply ||
      a.node.opening.ply - b.node.opening.ply ||
      a.node.opening.name.localeCompare(b.node.opening.name),
  )

  // in route order, so an ancestor is spelled out by the first arrival that needs it
  const said = new Set(arrivals.map(arrival => arrival.node.opening.id))
  return arrivals.map(arrival => {
    const under = findPath(nodes, arrival.node.opening.id)
      .slice(0, -1)
      .filter(above => !said.has(above.opening.id))

    for (const above of under) said.add(above.opening.id)
    return { ...arrival, under }
  })
}

export interface RouteStep {
  name: string
  /** Reached from the step before it by a move order that is not its own. */
  transposed: boolean
  /**
   * A line the game never stood in, carried along to spell out the one it did.
   *
   * Part of the name *after* an arrow rather than a step of the route, which is what
   * lets the sentence on hover say the whole destination: the run of a transposition is
   * its arrow step and every `under` step up to the first one that is not.
   */
  under: boolean
}

/**
 * The route as names, for whichever of the two labellings the screen uses.
 *
 * The first step is never a transposition however it was reached: there is nothing
 * saved in front of it to have come *from*, and an arrow with one end is a claim the
 * route cannot support. So the arrow always sits between two names and always means
 * "from this, into that".
 *
 * **The arrow fires once per divergence, at the front of the name it landed in.** An
 * arrival that skipped its parents brings them with it, and those are not jumps of their
 * own — they are the rest of one destination, so they read `›` and the arrow sits before
 * the first of them: `Caro Kann › Exchange Variation › 4.c3 → with 4.Nf3 › 5. c3`.
 *
 * Nor is *carrying on down* a jump. Once a game has transposed into a line, every deeper
 * line on the same chain is also one it did not play in its own order — so the route
 * drew an arrow at each of them and said "transposed" three times about one move order.
 * A line whose own parent is the step before it, with nothing unsaid in between, reads
 * `›`: the divergence already has its arrow, further up.
 *
 * Two *unrelated* transpositions still get an arrow each, which is the point of hanging
 * this off the chain rather than off a flag saying the route has gone astray.
 */
export function routeSteps(
  arrivals: Arrival[],
  label: (opening: OpeningLine) => string = openingLabel,
): RouteStep[] {
  const steps: RouteStep[] = []
  let previous: Arrival | null = null

  for (const arrival of arrivals) {
    const carries = arrival.under.length > 0
    const onwards =
      previous !== null &&
      !carries &&
      isParentLine(previous.node.opening.moves, arrival.node.opening.moves)

    const names = [...arrival.under, arrival.node].map(node => label(node.opening))
    for (const [at, name] of names.entries()) {
      steps.push({
        name,
        transposed: steps.length > 0 && at === 0 && !arrival.played && !onwards,
        under: at < arrival.under.length,
      })
    }

    previous = arrival
  }

  return steps
}

/** Whether the game played its way into this part of the repertoire at all. */
export function arrivedPlayed(arrivals: Arrival[], node: OpeningNode): boolean {
  const below = new Set(subtreeOpenings(node).map(opening => opening.id))
  return arrivals.some(arrival => below.has(arrival.node.opening.id) && arrival.played)
}

/**
 * `Queen's Gambit Declined › Exchange Variation → Panov Attack`.
 *
 * The separator carries the fact: `›` is a line you played into, `→` is one you
 * transposed into. A game with nothing to report reads exactly as it always has.
 */
export function routeText(steps: RouteStep[]): string {
  return steps
    .map((step, index) => (index === 0 ? step.name : `${step.transposed ? '→' : '›'} ${step.name}`))
    .join(' ')
}

/** The chain of variations from a root down to `id`, for breadcrumbs. */
export function findPath(nodes: OpeningNode[], id: string): OpeningNode[] {
  for (const node of nodes) {
    if (node.opening.id === id) return [node]
    const below = findPath(node.children, id)
    if (below.length > 0) return [node, ...below]
  }
  return []
}

/**
 * A stored line in the shape the code expects, whatever shape it was written in.
 *
 * Openings were the one collection without a normaliser — the read was a bare cast,
 * which was fine while the type was six required fields and stopped being fine when a
 * study was written on them. Same habit as `normalizePattern` and `normalizePlan`:
 * converted on read rather than migrated, so the 65 lines saved before any of this
 * existed need nothing done to them.
 */
/**
 * What of an opening actually goes to Firestore.
 *
 * The same job `patternBody` and `studyBody` do, and it exists for two reasons. `keys`
 * is derived on read and must never be stored, or a stale copy would outlive the lines
 * it was computed from; and `alts` is optional, so it has to be set or left out and
 * never assigned `undefined`, which rejects the whole document rather than the field.
 */
export function openingBody(opening: NewOpeningLine): NewOpeningLine {
  const body: NewOpeningLine = {
    name: opening.name,
    pgn: opening.pgn,
    moves: opening.moves,
    positionKey: opening.positionKey,
    ply: opening.ply,
    color: opening.color,
  }

  if (opening.alts && opening.alts.length > 0) body.alts = opening.alts

  return body
}

export function normalizeOpening(raw: Omit<OpeningLine, 'keys'>): OpeningLine {
  const alts = Array.isArray(raw.alts)
    ? raw.alts.filter(
        (alt): alt is AltLine =>
          Boolean(alt) && typeof alt.positionKey === 'string' && Array.isArray(alt.moves),
      )
    : []

  /*
    `keys` is derived here and nowhere else, so the match is one `some` over an array
    rather than a walk of the alternates on every one of 72 openings against every one of
    a thousand games. A line with no alternates has exactly the one key it always had,
    which is why none of the documents written before this needed touching.
  */
  const keys = [...new Set([raw.positionKey, ...alts.map(alt => alt.positionKey)])]

  const read: OpeningLine = { ...raw, alts, keys, study: normalizeStudy(raw.study) }
  // a line with no other way in carries no empty array to be read back as one
  if (alts.length === 0) delete read.alts

  return read
}
