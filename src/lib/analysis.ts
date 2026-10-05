import { Chess } from 'chess.js'
import { analyzePosition, MATE_SCORE } from './engine'
import { isFault } from './review'
import { settings, type AnalysisSettings } from './settings'
import type { GameRecord, StoredAnalysis } from '@/types/chess'

/** Annotation symbols, as used in the chess-courses annotator. */
export type MoveTag = '??' | '?' | '?!' | '!' | '!!'

/** Kept as a name for the pair; the values live on the account — see `lib/settings.ts`. */
export type Thresholds = Pick<AnalysisSettings, 'blunder' | 'mistake' | 'winning'>

/**
 * One depth for everything the app evaluates itself: a single game's analysis, the
 * engine's choice on a move, the verdict on an alternative you typed, and the drill.
 *
 * It is one number rather than a fast one and a careful one because these results are
 * read side by side — your alternative against the move you played, the drill's verdict
 * against both — and two depths in one view make the comparison meaningless. A quiet
 * middlegame position costs about 1.3s here, which is affordable even for the ones you
 * wait on. The batch panel still picks its own, lower depth: it pays that cost once per
 * game across a whole branch and only has to find the blunders.
 */
export const ENGINE_DEPTH = 21

/**
 * The chess-courses rule, which is context-sensitive by design:
 *
 * - `cpBefore > -winning` — no blunder mark when you were already lost; nothing
 *   left to throw away.
 * - `cpAfter < winning` — no blunder mark when you are still clearly winning after
 *   it; the game is not in danger.
 * - Otherwise a big loss is only `?!`: careless, but the context softens it.
 *
 * Going from clearly winning to level therefore does get the full mark, because
 * `cpAfter` has fallen back inside the decided band.
 */
export function classifyMove(
  cpBefore: number,
  cpAfter: number,
  wasBestMove: boolean,
  thresholds: Thresholds = settings(),
): MoveTag {
  const cpLoss = cpBefore - cpAfter
  // the same cut that makes a position won or lost: past it there is nothing to throw
  const stillInPlay = cpAfter < thresholds.winning && cpBefore > -thresholds.winning

  if (cpLoss > thresholds.blunder && stillInPlay) return '??'
  if (cpLoss > thresholds.mistake && stillInPlay) return '?'
  if (cpLoss > thresholds.mistake) return '?!'
  return wasBestMove ? '!!' : '!'
}

export interface AnalyzedMove {
  /** Index into the game's move list. */
  ply: number
  san: string
  /** Your own move number, which is what the phase ranges count. */
  moveNumber: number
  /** Centipawns for you before the move. */
  cpBefore: number
  /** Centipawns for you after it. */
  cpAfter: number
  cpLoss: number
  tag: MoveTag
}

export interface GameAnalysis {
  depth: number
  analyzedAt: number
  /** Your own moves only — this is about your mistakes, not your opponents'. */
  moves: AnalyzedMove[]
  blunders: number
  mistakes: number
  inaccuracies: number
}

export interface AnalyzeOptions {
  depth: number
  thresholds?: Thresholds
  /** Called after each evaluated position, for progress reporting. */
  onPosition?: () => void
  /** Checked between positions so a run can be stopped. */
  shouldStop?: () => boolean
}

export class AnalysisStopped extends Error {
  constructor() {
    super('Analysis stopped')
  }
}

/**
 * Evaluates every position the game passed through and classifies your own moves.
 *
 * The engine always scores from the side to move, so the evaluation after your move
 * is from your opponent's point of view and has to be negated to be comparable.
 */
export async function analyzeGame(game: GameRecord, options: AnalyzeOptions): Promise<GameAnalysis> {
  const chess = new Chess()
  const positions: string[] = [chess.fen()]
  const played: { from: string; to: string; san: string }[] = []

  for (const san of game.moves) {
    const move = chess.move(san)
    if (!move) break
    played.push({ from: move.from, to: move.to, san: move.san })
    positions.push(chess.fen())
  }

  const offset = game.color === 'white' ? 0 : 1
  const moves: AnalyzedMove[] = []

  for (let ply = offset; ply < played.length; ply += 2) {
    if (options.shouldStop?.()) throw new AnalysisStopped()

    const before = await analyzePosition(positions[ply], options.depth)
    options.onPosition?.()

    if (options.shouldStop?.()) throw new AnalysisStopped()

    const after = await analyzePosition(positions[ply + 1], options.depth)
    options.onPosition?.()

    const cpBefore = clamp(before.cp)
    // the engine scored this for the opponent, who is now to move
    const cpAfter = clamp(-after.cp)

    const uci = played[ply].from + played[ply].to
    const tag = classifyMove(
      cpBefore,
      cpAfter,
      before.bestMoveUci.startsWith(uci),
      options.thresholds,
    )

    moves.push({
      ply,
      san: played[ply].san,
      moveNumber: Math.floor(ply / 2) + 1,
      cpBefore,
      cpAfter,
      cpLoss: cpBefore - cpAfter,
      tag,
    })
  }

  return {
    depth: options.depth,
    analyzedAt: Date.now(),
    moves,
    blunders: moves.filter(move => move.tag === '??').length,
    mistakes: moves.filter(move => move.tag === '?').length,
    inaccuracies: moves.filter(move => move.tag === '?!').length,
  }
}

/**
 * A stored analysis with its marks re-derived from the evaluations it holds.
 *
 * The thresholds are a judgement and judgements change: `DECIDED` moved from two pawns
 * to three, which silently makes every stored mark the answer to an older question.
 * Re-analysing fifty games to ask the new one would be hours of engine time for numbers
 * that are already on disk — `cpBefore` and `cpAfter` are what `classifyMove` reads, and
 * both are stored, so the mark is derived rather than kept. Same habit as the pre-game
 * ratings and the variation tree.
 *
 * `wasBestMove` is the one input not stored, and it only ever separates `!!` from `!`,
 * neither of which is a fault; the old tag carries it forward.
 *
 * Note `annotatedPgn` is NOT rebuilt here — it is a copy of the game, written once, and
 * carries the marks of the analysis that produced it until the game is analysed again.
 */
export function normalizeAnalysis(
  analysis: StoredAnalysis,
  thresholds: Thresholds = settings(),
): StoredAnalysis {
  const moves = analysis.moves.map(move => ({
    ...move,
    cpLoss: move.cpBefore - move.cpAfter,
    tag: classifyMove(move.cpBefore, move.cpAfter, move.tag === '!!', thresholds),
  }))

  return {
    ...analysis,
    moves,
    blunders: moves.filter(move => move.tag === '??').length,
    mistakes: moves.filter(move => move.tag === '?').length,
    inaccuracies: moves.filter(move => move.tag === '?!').length,
  }
}

export interface OpponentMove {
  ply: number
  san: string
  moveNumber: number
  /** Where the position stood for YOU before their move, and after it. */
  cpBefore: number
  cpAfter: number
  /** What their move was worth to you. Positive means they handed you something. */
  swing: number
}

/**
 * What your opponent's moves did, read out of the analysis that is already stored.
 *
 * Nothing extra is evaluated or saved. The first pass scores the position before and
 * after each of *your* moves, and their reply is the gap between the two: the eval after
 * your move and the eval before your next one bracket it exactly, both already in your
 * frame. So "who created this advantage" is a question the stored data can answer and
 * was simply never asked.
 *
 * The last reply of the game has no move of yours after it to be bracketed by, so it is
 * left out rather than guessed at.
 */
export function opponentMoves(game: GameRecord): OpponentMove[] {
  const mine = game.analysis?.moves ?? []
  const replies: OpponentMove[] = []

  for (let index = 0; index < mine.length - 1; index++) {
    const ply = mine[index].ply + 1
    const san = game.moves[ply]
    if (!san) continue

    const cpBefore = mine[index].cpAfter
    const cpAfter = mine[index + 1].cpBefore

    replies.push({
      ply,
      san,
      moveNumber: Math.floor(ply / 2) + 1,
      cpBefore,
      cpAfter,
      swing: cpAfter - cpBefore,
    })
  }

  return replies
}

/** The replies that handed you a winning position you did not have a move earlier. */
export function giftsFrom(game: GameRecord, winning = 200): OpponentMove[] {
  return opponentMoves(game).filter(move => move.cpAfter >= winning && move.cpBefore < winning)
}

function clamp(cp: number): number {
  return Math.max(-MATE_SCORE, Math.min(MATE_SCORE, cp))
}

function pgnResult(game: GameRecord): string {
  if (game.result === 'draw') return '1/2-1/2'
  const userWon = game.result === 'win'
  return (game.color === 'white') === userWon ? '1-0' : '0-1'
}

/**
 * A complete PGN with your annotations written onto your own moves, so the analysis
 * travels with the game and can be pasted into any board.
 */
export function buildAnnotatedPgn(game: GameRecord, analysis: GameAnalysis): string {
  const tags = new Map(analysis.moves.map(move => [move.ply, move.tag]))
  const you = 'You'
  const white = game.color === 'white' ? you : game.opponent
  const black = game.color === 'white' ? game.opponent : you
  const date = new Date(game.playedAt).toISOString().slice(0, 10).replace(/-/g, '.')

  const headers = [
    `[Event "${game.timeClass} ${game.timeControl}"]`,
    `[Site "${game.url}"]`,
    `[Date "${date}"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${pgnResult(game)}"]`,
    game.eco ? `[ECO "${game.eco}"]` : null,
    `[Annotator "Stockfish depth ${analysis.depth}"]`,
  ].filter(Boolean)

  const body: string[] = []
  game.moves.forEach((san, ply) => {
    if (ply % 2 === 0) body.push(`${ply / 2 + 1}.`)

    // the PGN carries exactly the marks the app shows — see FAULT_TAGS
    const tag = tags.get(ply)
    body.push(tag && isFault(tag) ? san + tag : san)
  })
  body.push(pgnResult(game))

  return `${headers.join('\n')}\n\n${body.join(' ')}`
}
