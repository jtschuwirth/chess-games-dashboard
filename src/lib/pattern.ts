import { Chess } from 'chess.js'
import {
  commentAt as setComment,
  fromPgn,
  mainLine,
  mainPath,
  toPgn,
  walk,
  type MoveTree,
  type Path,
} from './movetree'
import type { GameRecord, PatternKind, PatternLine, PatternRecord } from '@/types/chess'
import { trainableMistakes } from './review'

/**
 * The kinds, in the order they are offered. Tactics first because that is what most
 * patterns turn out to be; endgame last because it is the one you reach for least.
 */
export const PATTERN_KINDS: PatternKind[] = ['tactics', 'strategy', 'development', 'endgame']

export const KIND_LABEL: Record<PatternKind, string> = {
  tactics: 'Tactics',
  strategy: 'Strategy',
  development: 'Development',
  endgame: 'Endgame',
}

/**
 * One colour per kind, used wherever a pattern is named. They are off the zinc palette
 * for the same reason the board is: a kind is a category, and categories read faster as
 * colour than as a word you have to finish reading.
 */
export const KIND_BADGE: Record<PatternKind, string> = {
  tactics: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  strategy: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  development: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  endgame: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

/** An empty line, which is what a new example starts as. */
export function emptyLine(): PatternLine {
  return { title: '', pgn: '', moves: [], startPly: 0, note: '', comments: {} }
}

/**
 * What was written about one point in a line, raw.
 *
 * Untrimmed on purpose: this is also what the editor puts in its field, and trimming
 * there would eat the space you just typed.
 */
export function commentAt(line: PatternLine, ply: number): string {
  return line.comments?.[String(ply)] ?? ''
}

/**
 * The line with one comment written, or cleared when the text is emptied.
 *
 * Clearing removes the key rather than storing an empty string, so a comment deleted
 * does not keep its marker on the move strip.
 */
export function withComment(line: PatternLine, ply: number, text: string): PatternLine {
  const comments = { ...(line.comments ?? {}) }

  if (text.trim().length === 0) delete comments[String(ply)]
  else comments[String(ply)] = text

  return { ...line, comments }
}

/** The plies carrying a comment, so the move strip can mark where there is something to read. */
export function commentedPlies(line: PatternLine): Set<number> {
  return new Set(
    Object.entries(line.comments ?? {})
      .filter(([, text]) => text.trim().length > 0)
      .map(([ply]) => Number(ply)),
  )
}

/**
 * Turns a pasted game into a move list. Unlike `parseOpening` this accepts a PGN with
 * no moves at all: a pattern can be written up before you have a game to show it in,
 * and an example with an empty PGN is simply one with nothing to step through yet.
 */
export function parsePatternPgn(pgn: string): string[] {
  const trimmed = pgn.trim()
  if (trimmed.length === 0) return []

  const chess = new Chess()
  try {
    chess.loadPgn(trimmed)
  } catch {
    throw new Error('Invalid PGN — check the move notation and try again.')
  }

  return chess.history()
}

/**
 * Keeps `startPly` inside the line it points at. A PGN that is re-pasted shorter would
 * otherwise leave the board opening past the end of the game.
 */
export function clampStartPly(startPly: number, moves: string[]): number {
  if (!Number.isFinite(startPly)) return 0
  return Math.max(0, Math.min(Math.round(startPly), moves.length))
}

/** A line is worth storing once it has a name or something to show. */
export function lineHasContent(line: PatternLine): boolean {
  return (
    line.title.trim().length > 0 ||
    line.moves.length > 0 ||
    line.note.trim().length > 0 ||
    commentedPlies(line).size > 0
  )
}

/**
 * A stored pattern in the shape the code expects, whatever shape it was written in.
 *
 * One shape has been replaced: a single `main` line beside a list of `examples`. A
 * pattern is not an opening, so there was never a main line for the rest to be
 * variations of — an endgame idea has no main line at all — and what that field actually
 * held was the first example. So it becomes the first example, converted on read rather
 * than migrated, the same habit as `normalizePlan` and `betterMovesOf`. The writes drop
 * the field, so a pattern rewrites itself the first time you edit it.
 */
export function normalizePattern(raw: PatternRecord): PatternRecord {
  const stored = Array.isArray(raw.examples) ? raw.examples : []
  const normalized: PatternRecord = {
    ...raw,
    examples: raw.main && lineHasContent(raw.main) ? [raw.main, ...stored] : stored,
  }

  delete normalized.main
  return normalized
}

/**
 * The tag a pattern contributes to a review. It is simply the name, which is what makes
 * every count, filter and table that already works on tags work on patterns too without
 * knowing patterns exist. The cost is that renaming a pattern leaves the old name behind
 * on reviews already written — they keep it as an ordinary free tag.
 */
export function patternTag(pattern: PatternRecord): string {
  return pattern.name.trim().toLowerCase()
}

/** Every pattern name, as tags, for the review form's picker. */
export function patternTags(patterns: PatternRecord[]): string[] {
  return patterns.map(patternTag).filter(tag => tag.length > 0)
}

/**
 * The games whose review says this pattern was the thing to play. Read from the same
 * `trainableMistakes` the tag table counts, so a pattern's games and its row in the
 * Mistake database are always the same set.
 */
export function gamesTagged(games: GameRecord[], pattern: PatternRecord): GameRecord[] {
  const tag = patternTag(pattern)
  if (tag.length === 0) return []

  return games.filter(game =>
    trainableMistakes(game.review).some(mistake => mistake.tags.includes(tag)),
  )
}

/** How many times a pattern has been reached for across a set of games. */
export function timesTagged(games: GameRecord[], pattern: PatternRecord): number {
  const tag = patternTag(pattern)
  if (tag.length === 0) return 0

  return games.reduce(
    (total, game) =>
      total + trainableMistakes(game.review).filter(mistake => mistake.tags.includes(tag)).length,
    0,
  )
}

/** Patterns keyed by their tag, for turning a tag back into the thing it points at. */
export function patternsByTag(patterns: PatternRecord[]): Map<string, PatternRecord> {
  return new Map(patterns.map(pattern => [patternTag(pattern), pattern]))
}

/* ----------------------------------------------------------------- the tree */

/**
 * A stored line as a move tree.
 *
 * The PGN is the authority, because it is the only field that can hold a branch —
 * `moves` is a flat list and always was. Everything written before this has a PGN with
 * no brackets in it, so it reads back as the same single line it always was.
 *
 * Comments used to live in their own map, keyed by how many half-moves had been played.
 * They live on the moves now, which is where PGN has always put them and the only place
 * that still means something once a line can branch — ply 7 names one move on a line
 * and several on a tree. Old ones are grafted onto the main line on read rather than
 * migrated, the same habit as `main` folding into `examples`.
 */
export function lineTree(line: PatternLine): MoveTree {
  let tree = fromPgn(line.pgn ?? '')

  // a line stored before the PGN was kept, or one whose PGN failed to parse, still has
  // its parsed moves — rebuild from those rather than showing an empty board
  if (tree.children.length === 0 && line.moves.length > 0) {
    tree = fromPgn(line.moves.join(' '))
  }

  for (const [key, text] of Object.entries(line.comments ?? {})) {
    const ply = Number(key)
    if (!Number.isInteger(ply) || ply < 1 || !text.trim()) continue
    const path = mainPath(tree, ply)
    if (path.length === ply) tree = setComment(tree, path, text)
  }

  return tree
}

/** Where a line's board opens, as a path. `startPly` counts along the main line. */
export function lineHome(tree: MoveTree, startPly: number): Path {
  return mainPath(tree, clampStartPly(startPly, mainLine(tree)))
}

/**
 * The line as it should be stored, after the tree has been edited.
 *
 * `pgn` carries everything — the branches and what is written on each move — and
 * `moves` keeps the main line for the readers that only ever wanted one. `comments` is
 * dropped: it is in the PGN now, and leaving it would have `lineTree` graft a stale
 * copy back on over the top on the next read.
 */
export function lineFromTree(
  line: PatternLine,
  tree: MoveTree,
  startPly: number,
): PatternLine {
  const next: PatternLine = {
    ...line,
    pgn: toPgn(tree),
    moves: mainLine(tree),
    startPly: clampStartPly(startPly, mainLine(tree)),
  }
  delete next.comments
  return next
}

/** Every move of a tree that carries a comment, in reading order. */
export function commentedNodes(tree: MoveTree): { path: Path; san: string; text: string }[] {
  return walk(tree)
    .filter(entry => (entry.node.comment ?? '').trim().length > 0)
    .map(entry => ({ path: entry.path, san: entry.node.san, text: entry.node.comment as string }))
}
