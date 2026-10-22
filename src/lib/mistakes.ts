/**
 * Every marked move in a slice, as rows you can filter and count.
 *
 * The dashboard answers "how did these games go". This answers the other question: what
 * actually went wrong, one move at a time, and where on the board it keeps happening.
 *
 * **Both new facts are read off the notation rather than by replaying the game.** A SAN
 * already carries the square the move landed on and the piece that moved — `Nxd4` is a
 * knight to d4 — and castling is the only case needing the colour to resolve. Replaying
 * every analysed game to learn the same two things took 1.9 seconds against 2
 * milliseconds for the parse, which is the difference between a page that can re-filter
 * as you type and one that cannot. Checked against a real replay on all 1485 marked
 * moves in the data: the square agreed on every one and so did the piece.
 */
import { isComparable, thinkBandOf } from './accuracy'
import { gamePhases, thinkPerPly, type GamePhase } from './clocks'
import { standingOf, verdictsOf } from './verdict'
import { STANDINGS, type Standing } from './bands'
import { isFault, markBadge } from './review'
import { SEVERITIES, settings, type AnalysisSettings } from './settings'
import { SEVERITY_MARK } from './bands'
import type { Color, GameRecord, MoveVerdict } from '@/types/chess'

/** The pieces a move can be, in the order a board is worth reading them in. */
export const PIECES = ['p', 'n', 'b', 'r', 'q', 'k'] as const
export type Piece = (typeof PIECES)[number]

export const PIECE_LABEL: Record<Piece, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
}

/** Solid figurines: one colour renders the same in every font, as the board learned. */
export const PIECE_FIGURINE: Record<Piece, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

/**
 * The square a move landed on, read straight off the notation.
 *
 * Everything but castling ends in its destination, including a capture (`exd5`), a check
 * (`Qh5+`) and a promotion (`d8=Q`). Castling names no square at all, so the colour says
 * which one the king reached. Null when the notation is something this cannot read, which
 * a caller drops rather than guessing at.
 */
export function landedOn(san: string, color: Color): string | null {
  const clean = san.replace(/[+#!?]+$/, '')
  if (clean.startsWith('O-O-O') || clean.startsWith('0-0-0')) return color === 'white' ? 'c1' : 'c8'
  if (clean.startsWith('O-O') || clean.startsWith('0-0')) return color === 'white' ? 'g1' : 'g8'

  const match = clean.replace(/=[QRBNqrbn]$/, '').match(/([a-h][1-8])$/)
  return match ? match[1] : null
}

/** Which piece moved. A SAN with no leading piece letter is a pawn move. */
export function pieceMoved(san: string): Piece {
  if (san.startsWith('O-O') || san.startsWith('0-0')) return 'k'
  const first = san[0]
  return ('NBRQK'.includes(first) ? first.toLowerCase() : 'p') as Piece
}

/**
 * Which phase of the game a move was played in, by the label the phase table uses.
 *
 * `moveNumber` on an analysed move is already a count of *your* own moves — ply 4 and
 * ply 5 are both move 3 — which is exactly the quantity the phase ranges are in, so
 * there is nothing to convert. Your own phases, so "where do I go wrong in the opening"
 * is asked in the move numbers you decided the opening runs to.
 *
 * It is the same vocabulary as the dashboard's `Ended in` and a different question:
 * that one asks how long the game lasted, this one asks when the move was played. Null
 * when the phases do not reach it, which only a hand-edited first boundary can produce.
 */
export function phaseOfMove(moveNumber: number, phases: GamePhase[]): string | null {
  return phases.find(phase => moveNumber >= phase.from && moveNumber <= phase.to)?.label ?? null
}

export interface MistakeRow {
  game: GameRecord
  ply: number
  moveNumber: number
  san: string
  /** `?`, `??`, or `?!` where the account shows inaccuracies. */
  tag: string
  cpBefore: number
  cpAfter: number
  /** The square it landed on, as played. */
  square: string
  piece: Piece
  /** The phase of the game it was played in, by the phase table's own label. */
  phase: string | null
  /**
   * The band you were standing in before you played it.
   *
   * Read off `cpBefore`, which every marked move carries — so unlike the second pass's
   * reading this is known for all of them. It is the axis the verdict is named from and
   * the one the page could not narrow by: "every mistake I made while winning" was a
   * question you had to leave the app to ask.
   */
  stood: Standing
  /** Seconds spent on the move, or null where the game carries no clock readings. */
  think: number | null
  /** Which think-time band that falls in, by the band's own label. */
  thinkBand: string | null
  /**
   * The second pass's reading of this move, where it has read it.
   *
   * Null covers two cases that look the same on a row and are not: a move nobody has
   * read yet, and one whose reading you threw out. Both mean "no verdict to show", and
   * the panel says how many of the first there are rather than letting a mostly-empty
   * column read as the second pass having found nothing.
   *
   * Derived, not stored — `verdictsOf` re-makes the judgement from the measurements on
   * every read, so a band moved in the settings renames these with no engine run. It is
   * cheap: a map over the few verdicts a game has, with no replay of the game.
   */
  verdict: MoveVerdict | null
}

/**
 * Every marked move in these games, newest game first.
 *
 * "Marked" is whatever the account counts as a fault, which is `isFault` and therefore
 * the `marks` setting — so turning inaccuracies on fills this page as it fills the move
 * list. A move whose notation names no square is dropped rather than guessed at; none
 * exist in the data, and one would be a hand-edited document rather than a real game.
 */
export function mistakeRows(
  games: GameRecord[],
  config: AnalysisSettings = settings(),
): MistakeRow[] {
  const rows: MistakeRow[] = []
  // read once rather than per move: it is the same six ranges for every row
  const phases = gamePhases(config)

  for (const game of games) {
    const marked = (game.analysis?.moves ?? []).filter(move => isFault(move.tag))
    if (marked.length === 0) continue

    // both read once per game, and only for a game with something to say
    const spent = thinkPerPly(game)
    const verdicts = verdictsOf(game, config)

    for (const move of marked) {
      const square = landedOn(move.san, game.color)
      if (!square) continue

      const think = spent?.[move.ply] ?? null

      rows.push({
        game,
        ply: move.ply,
        moveNumber: move.moveNumber,
        san: move.san,
        tag: move.tag,
        cpBefore: move.cpBefore,
        cpAfter: move.cpAfter,
        square,
        piece: pieceMoved(move.san),
        phase: phaseOfMove(move.moveNumber, phases),
        stood: standingOf(move.cpBefore, config),
        think,
        thinkBand: think === null ? null : thinkBandOf(think),
        verdict: readingAt(verdicts, move.ply),
      })
    }
  }

  /*
   * One ordering rule, most recent first, and it holds inside a game as well as between
   * them. Newest game first with the moves ascending underneath read as two sorts facing
   * opposite ways: move 31 was played after move 12, so under "most recent first" it
   * comes first.
   */
  return rows.sort((a, b) => b.game.playedAt - a.game.playedAt || b.ply - a.ply)
}

/** The reading for one ply, with a rejected one counting as no reading. */
function readingAt(
  verdicts: Record<string, MoveVerdict>,
  ply: number,
): MoveVerdict | null {
  const found = verdicts[String(ply)]
  return found && !found.dismissed ? found : null
}

/** How many rows the second pass has actually read, which a panel showing them must say. */
export function readCount(rows: MistakeRow[]): number {
  return rows.reduce((total, row) => total + (row.verdict ? 1 : 0), 0)
}

/**
 * Every analysed move of yours in these games, bucketed the way the chips are.
 *
 * **This is the denominator, and without it none of the chips mean anything.** Five
 * marked moves after a five-minute think against two hundred and forty-four after a
 * think under five seconds says only that you rarely think for five minutes. The
 * question is what share of each went wrong, and that needs the moves where nothing
 * did — which are 93% of them and were already on disk: the first pass evaluates
 * *every* one of your moves, so `analysis.moves` is the whole denominator and not a
 * sample of it. Checked on the real thing: it holds exactly your own move count on all
 * 570 analysed games, no game short and none over.
 *
 * Counted over the same games the rows come from, by the same rules, so a chip's two
 * numbers can never be drawn from different sets — which is the failure a second
 * reader of this data would otherwise walk into, since `mistakesByThinkTime` counts
 * only games the current build analysed and this counts all of them.
 *
 * `stale` is why that difference exists, and it is reported rather than filtered: a
 * shallower engine finds fewer faults *and* scores them smaller, so a stale analysis
 * pulls a share down in a direction nothing on screen would otherwise say. There are
 * none in this account today, and there were 138 for months once.
 */
export interface MoveTotals {
  /** Every move of yours the engine has been over. */
  moves: number
  byPiece: Map<Piece, number>
  byPhase: Map<string, number>
  byThink: Map<string, number>
  /**
   * Every analysed move by the band it was played from.
   *
   * A real denominator, which is the whole point: `cpBefore` is stored on every move the
   * first pass evaluated and not only on the ones it marked, so "how often do I go wrong
   * while winning" is answerable rather than "how many of my mistakes happened there".
   */
  byStood: Map<Standing, number>
  /** How many of them carry a clock reading, which only `byThink` can be short of. */
  timed: number
  /** Games in the slice analysed by an older build, which read low. */
  stale: number
}

export function moveTotals(
  games: GameRecord[],
  config: AnalysisSettings = settings(),
): MoveTotals {
  const totals: MoveTotals = {
    moves: 0,
    byPiece: new Map(),
    byPhase: new Map(),
    byThink: new Map(),
    byStood: new Map(),
    timed: 0,
    stale: 0,
  }

  const phases = gamePhases(config)
  const add = <T,>(into: Map<T, number>, key: T) => into.set(key, (into.get(key) ?? 0) + 1)

  for (const game of games) {
    const moves = game.analysis?.moves
    if (!moves || moves.length === 0) continue
    if (!isComparable(game)) totals.stale++

    const spent = thinkPerPly(game)

    for (const move of moves) {
      totals.moves++
      add(totals.byPiece, pieceMoved(move.san))
      add(totals.byStood, standingOf(move.cpBefore, config))

      const phase = phaseOfMove(move.moveNumber, phases)
      if (phase) add(totals.byPhase, phase)

      const think = spent?.[move.ply]
      if (think === undefined) continue
      totals.timed++

      const band = thinkBandOf(think)
      if (band) add(totals.byThink, band)
    }
  }

  return totals
}

/**
 * The bands a move can be played from, best first.
 *
 * The order the verdict grid already reads in, and `mate` is left out because a position
 * past the mate score is one you are being mated in — there is no move to mark there that
 * the grading would not refuse. A band with nothing marked keeps its chip, since "I am
 * never marked from a lost position" is the sort of thing the row exists to show.
 */
export const STOOD_IN: Standing[] = [...STANDINGS]
  .filter(standing => standing !== 'mate')
  .reverse()

/** Which marks the account actually shows, worst first, for the filter row. */
export function activeMarks(config = settings()): string[] {
  return SEVERITIES.filter(severity => config.marks.includes(severity))
    .map(severity => SEVERITY_MARK[severity])
    .reverse()
}

/**
  * How many of the engine's candidates held, in the three buckets worth telling apart.
  *
  * The counts rather than `sharp` / `tight` / `stable`, deliberately. Those names are a
  * judgement with a setting behind them — `sharp` is "at most `narrow`", `stable` is
  * "everything that was looked at" — and on a filter row what you want is the thing
  * itself: was there one move, a few, or did anything do. `looked` is 5 on 98% of the
  * readings, so `5+` is `stable` in all but a handful and says so without a word.
  *
  * `holds` is never 0 in this data and cannot be: the search is told to keep five lines
  * and the move you played is one of them, so something always holds or the position is
  * not one the second pass reads.
  */
export const HELD_BANDS: { label: string; from: number; to: number | null }[] = [
  { label: '1–2', from: 1, to: 2 },
  { label: '3–4', from: 3, to: 4 },
  { label: '5+', from: 5, to: null },
]

/** Which band a count of holds falls in. Null for a move the second pass has not read. */
export function heldBandOf(holds: number | null): string | null {
  if (holds === null) return null
  return (
    HELD_BANDS.find(band => holds >= band.from && (band.to === null || holds <= band.to))?.label ??
    null
  )
}

export interface MistakeFilter {
  /** Marks to keep. Empty means every mark the account shows. */
  marks: string[]
  /** Pieces to keep. Empty means every piece. */
  pieces: Piece[]
  /** Phase labels to keep, as `gamePhases` writes them. Empty means anywhere. */
  phases: string[]
  /** Think-time band labels to keep. Empty means however long you took. */
  think: string[]
  /** Squares the move landed on, as played. Empty means anywhere on the board. */
  squares: string[]
  /** Bands you were standing in. Empty means wherever you stood. */
  stood: Standing[]
  /** How many candidates held, by `HELD_BANDS` label. Empty means however many. */
  held: string[]
}

export const NO_MISTAKE_FILTER: MistakeFilter = {
  marks: [],
  pieces: [],
  phases: [],
  think: [],
  squares: [],
  stood: [],
  held: [],
}

/**
 * The same filter with the square picked off.
 *
 * The heatmap is the control that sets `squares`, so it has to draw the board with that
 * one not applied — otherwise choosing e5 leaves a board with one square on it and no way
 * to choose another. It is the chips' rule, one filter narrower: a control shows you what
 * it would give you, not what it has already given you.
 */
export function exceptSquares(filter: MistakeFilter): MistakeFilter {
  return { ...filter, squares: [] }
}

export function matchesMistake(row: MistakeRow, filter: MistakeFilter): boolean {
  if (filter.marks.length > 0 && !filter.marks.includes(row.tag)) return false
  if (filter.pieces.length > 0 && !filter.pieces.includes(row.piece)) return false
  if (filter.phases.length > 0 && (row.phase === null || !filter.phases.includes(row.phase))) {
    return false
  }
  /*
   * A move with no reading is dropped by a think filter rather than kept. The question
   * being asked is how long you took, and a game the clock was never captured for has no
   * answer — folding those in with the fast moves would be inventing one. How many that
   * is, is on the screen beside the chips.
   */
  if (filter.think.length > 0 && (row.thinkBand === null || !filter.think.includes(row.thinkBand))) {
    return false
  }
  if (filter.squares.length > 0 && !filter.squares.includes(row.square)) return false
  if (filter.stood.length > 0 && !filter.stood.includes(row.stood)) return false
  /*
   * A move the second pass has not read has no count to band, so a held filter drops it
   * rather than guessing — the rule a think filter follows for a game with no clocks.
   * How many that is sits in the row's own heading.
   */
  if (filter.held.length > 0) {
    const band = heldBandOf(row.verdict?.holds ?? null)
    if (band === null || !filter.held.includes(band)) return false
  }
  return true
}

/** How many rows carry a clock reading at all, which the think row has to say. */
export function timedCount(rows: MistakeRow[]): number {
  return rows.reduce((total, row) => total + (row.thinkBand === null ? 0 : 1), 0)
}

export interface HeatSquare {
  square: string
  count: number
  /** 0 to 1 against the worst square, which is what the shading is drawn from. */
  share: number
}

/**
 * How often a mistake landed on each square, as played.
 *
 * **The square is the square.** This mirrored a Black game's ranks onto White's for a
 * while, so that your own side was always at the bottom and a weakness in front of your
 * own king read on one rank instead of two. The argument was about *relative* geometry
 * and the board it was drawn on was labelled with *absolute* names, which is a
 * contradiction and it told a lie: the square printed `e5` held White's e5 mistakes and
 * Black's e4 ones, and e4 and e5 are not the same square to anybody. A relative board
 * would need relative labels — "my second rank" — and that is a second coordinate system
 * for the sake of a question the Colour chips already answer honestly, by narrowing to
 * one colour and letting rank 7 be rank 7.
 *
 * `share` is measured against the worst square rather than the total, because the
 * question is which squares stand out and a true share would make every one of
 * sixty-four a sliver. The same reasoning the think-time bars follow.
 */
export function heatmapOf(rows: MistakeRow[]): HeatSquare[] {
  const counts = new Map<string, number>()

  for (const row of rows) {
    counts.set(row.square, (counts.get(row.square) ?? 0) + 1)
  }

  const worst = Math.max(0, ...counts.values())
  return [...counts.entries()].map(([square, count]) => ({
    square,
    count,
    share: worst === 0 ? 0 : count / worst,
  }))
}

/** The count on each square, keyed for a board to look up as it draws. */
export function heatBySquare(rows: MistakeRow[]): Map<string, HeatSquare> {
  return new Map(heatmapOf(rows).map(entry => [entry.square, entry]))
}

/** How many of each mark are in a set of rows, for the chips to carry their counts. */
export function countBy<T extends string>(
  rows: MistakeRow[],
  of: (row: MistakeRow) => T,
): Map<T, number> {
  const counts = new Map<T, number>()
  for (const row of rows) {
    const key = of(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** The colour a mark is drawn in on this page, from the one severity scale. */
export function markTint(tag: string): string {
  return markBadge(tag)?.fill ?? '#a1a1aa'
}
