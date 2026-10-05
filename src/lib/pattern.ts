import { Chess } from 'chess.js'
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
