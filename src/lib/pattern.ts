import { Chess } from 'chess.js'
import {
  commentAt as setComment,
  fromPgn,
  mainLine,
  mainPath,
  toPgn,
  walk,
  START_FEN,
  type MoveTree,
  type Path,
} from './movetree'
import type {
  GameRecord,
  NewPattern,
  PatternEssentials,
  PatternKind,
  PatternLine,
  PatternRecord,
  PatternType,
} from '@/types/chess'
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

/* ------------------------------------------------------- the two document types */

export const PATTERN_TYPES: PatternType[] = ['pattern', 'essentials']

export const TYPE_LABEL: Record<PatternType, string> = {
  pattern: 'Pattern',
  essentials: 'Essentials',
}

/**
 * Zinc rather than a colour of its own, deliberately. The kind already owns the colour
 * on these pages, and a second coloured pill beside it would make a row read as two
 * categories of equal weight when one of them is only which form was filled in.
 */
export const TYPE_BADGE: Record<PatternType, string> = {
  pattern: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  essentials: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
}

/** Which type a stored document is. Absent means a pattern: everything predates this. */
export function typeOf(pattern: PatternRecord): PatternType {
  return pattern.type === 'essentials' ? 'essentials' : 'pattern'
}

export interface EssentialsSection {
  /** The field it writes to. */
  key: keyof PatternEssentials
  /** How the method numbers it — "3a" is a half of one question, not a fourth one. */
  number: string
  title: string
  /** The method's own prompt, which is also the section's empty state. */
  hint: string
}

/**
 * The questions the essentials method asks, in the order it asks them.
 *
 * A table for the reason `TRANSITIONS`, `GAME_NAMES` and `STUDY_SECTIONS` are: the form
 * and the page both render it, so a question cannot be described on a screen without
 * existing, and a fifth one is a row here and nothing else.
 */
export const ESSENTIALS_SECTIONS: EssentialsSection[] = [
  {
    key: 'interactions',
    number: '1',
    title: 'Piece interactions and responsibilities',
    hint: 'Notice how the relevant pieces interact. What is each one responsible for in making the tactic possible?',
  },
  {
    key: 'weaknesses',
    number: '2',
    title: 'Strategical weaknesses',
    hint: "What in the opponent's position paves the way for the tactic?",
  },
  {
    key: 'breaks',
    number: '3a',
    title: 'Changes that make it fail',
    hint: 'Change the position slightly, in a realistic way. What stops this combination working?',
  },
  {
    key: 'survives',
    number: '3b',
    title: 'Changes it survives',
    hint: 'What can change and still leave the tactic — or a different one — available?',
  },
]

export const ESSENTIALS_KEYS = ESSENTIALS_SECTIONS.map(section => section.key)

/** The method answered by nobody yet. A function, so no two callers share one array. */
export function emptyEssentials(): PatternEssentials {
  return { interactions: [], weaknesses: [], breaks: [], survives: [] }
}

/** Whether anything has been written against any of the questions. */
export function essentialsHaveContent(essentials: PatternEssentials): boolean {
  return ESSENTIALS_KEYS.some(key => essentials[key].some(point => point.trim().length > 0))
}

/** How many points are written across all four, which is the figure a row shows. */
export function essentialsCount(essentials: PatternEssentials | undefined): number {
  if (!essentials) return 0
  return ESSENTIALS_KEYS.reduce(
    (total, key) => total + essentials[key].filter(point => point.trim().length > 0).length,
    0,
  )
}

/* ------------------------------------------------------------------ the motif */

export interface MotifGroup {
  name: string
  motifs: string[]
}

/**
 * Which tactic a write-up is about, offered per kind.
 *
 * `kind` is four values on purpose — "a pattern you cannot file under one of them is
 * usually two patterns" — and that reasoning does not carry here: a fork, a pin and a
 * back rank mate are all tactics and all different things to train. So this is a longer
 * fixed vocabulary, grouped the way `TAG_GROUPS` is so that sixteen names stay
 * scannable rather than becoming a wall.
 *
 * A kind with no groups shows no picker at all, which is what the other three do today.
 * Giving the endgame its own motifs later is one entry in this table.
 */
export const MOTIFS_BY_KIND: Record<PatternKind, MotifGroup[]> = {
  tactics: [
    { name: 'Attacks', motifs: ['fork', 'double attack', 'discovered attack', 'x-ray'] },
    { name: 'Restraint', motifs: ['pin', 'skewer', 'interference', 'trapped piece'] },
    {
      name: 'Removing the defence',
      motifs: ['deflection', 'decoy', 'removing the defender', 'overloading', 'clearance'],
    },
    { name: 'Mate', motifs: ['mating net', 'back rank mate', 'smothered mate'] },
  ],
  strategy: [],
  development: [],
  endgame: [],
}

/** Every motif a kind offers, flat — what a stored value is checked against. */
export function motifsFor(kind: PatternKind): string[] {
  return MOTIFS_BY_KIND[kind].flatMap(group => group.motifs)
}

/**
 * The motif a document actually carries, or null.
 *
 * Checked against the kind rather than trusted: a kind changed from tactics to endgame
 * leaves a `fork` behind in the document, and a hand-edited one could name anything.
 * Derived on read so neither needs a migration.
 */
export function motifOf(pattern: PatternRecord): string | null {
  if (!pattern.motif) return null
  return motifsFor(pattern.kind).includes(pattern.motif) ? pattern.motif : null
}

/**
 * A new example that is a position rather than a game.
 *
 * It starts on the opening position rather than on an empty string, so the board has
 * something to draw from the first render — you then paste over it. An empty FEN would
 * be an invalid one, and the editor would open on a broken board.
 */
export function emptyPositionLine(): PatternLine {
  return { ...emptyLine(), startFen: START_FEN }
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
export function parsePatternPgn(pgn: string, startFen?: string): string[] {
  const trimmed = pgn.trim()

  // the position has to be checked even with no moves on it: a FEN is the whole example
  // in the common tactical case, and an unreadable one must not reach a board
  const chess = startFen ? fromFen(startFen) : new Chess()
  if (trimmed.length === 0) return []

  try {
    /*
     * From a position, the moves are loaded as a PGN carrying it — which is where PGN
     * has always put a setup position, and means a pasted line keeps working whether it
     * is written `1... Qxh7+` or bare SAN.
     */
    if (startFen) chess.loadPgn(`[SetUp "1"]\n[FEN "${startFen}"]\n\n${trimmed}`)
    else chess.loadPgn(trimmed)
  } catch {
    throw new Error('Invalid PGN — check the move notation and try again.')
  }

  return chess.history()
}

/** A position, or a readable complaint about it. The only place a FEN is validated. */
export function fromFen(fen: string): Chess {
  try {
    return new Chess(fen.trim())
  } catch {
    throw new Error('Invalid FEN — check the position and try again.')
  }
}

/** Whether a FEN can be read at all, for a form that wants to say so as you type. */
export function fenIsValid(fen: string): boolean {
  try {
    fromFen(fen)
    return true
  } catch {
    return false
  }
}

/**
 * Keeps `startPly` inside the line it points at. A PGN that is re-pasted shorter would
 * otherwise leave the board opening past the end of the game.
 */
export function clampStartPly(startPly: number, moves: string[]): number {
  if (!Number.isFinite(startPly)) return 0
  return Math.max(0, Math.min(Math.round(startPly), moves.length))
}

/**
 * A line is worth storing once it has a name or something to show.
 *
 * A `startFen` counts on its own. The case this was built for is a tactic where you have
 * the position and not the game, and a position with no moves played on it yet is a
 * complete example — without this it would be dropped silently on the way to Firestore.
 */
export function lineHasContent(line: PatternLine): boolean {
  return (
    line.title.trim().length > 0 ||
    line.moves.length > 0 ||
    (line.startFen ?? '').trim().length > 0 ||
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
  const type = typeOf(raw)

  const normalized: PatternRecord = {
    ...raw,
    type,
    examples: raw.main && lineHasContent(raw.main) ? [raw.main, ...stored] : stored,
    patternIds: Array.isArray(raw.patternIds) ? raw.patternIds.filter(id => typeof id === 'string') : [],
  }

  // every question answered by an array, whatever the document turned up holding, so no
  // reader has to guard each one — and only on the type that has them
  if (type === 'essentials') {
    const held = (raw.essentials ?? {}) as Partial<PatternEssentials>
    normalized.essentials = Object.fromEntries(
      ESSENTIALS_KEYS.map(key => [
        key,
        (Array.isArray(held[key]) ? held[key] : []).filter(point => typeof point === 'string'),
      ]),
    ) as unknown as PatternEssentials
  } else {
    delete normalized.essentials
  }

  // a motif its kind does not offer is dropped rather than shown: a kind changed from
  // tactics to endgame leaves one behind, and a hand-edited document could name anything
  const motif = motifOf(raw)
  if (motif) normalized.motif = motif
  else delete normalized.motif

  delete normalized.main
  return normalized
}

/**
 * The optional fields, named once so a write can clear the ones it is not setting.
 *
 * An update *merges*, so a field nobody writes any more simply stays in the document —
 * which is the trap `main` already fell into. A pattern that used to be an essentials
 * document, or a tactic re-filed as an endgame, would otherwise keep answers and a motif
 * that `normalizePattern` cannot drop hard enough to stop them coming back.
 */
export const PATTERN_OPTIONAL_FIELDS = ['motif', 'essentials', 'patternIds'] as const

/** An example in the shape Firestore will take: no key is ever present and undefined. */
function exampleBody(line: PatternLine): PatternLine {
  const next: PatternLine = { ...line }

  const startFen = (next.startFen ?? '').trim()
  if (startFen.length > 0) next.startFen = startFen
  else delete next.startFen

  if (!next.orientation) delete next.orientation
  // kept rather than folded into the PGN here: an example the editor never opened still
  // holds its comments in the old map, and `lineTree` is what grafts them on
  if (!next.comments) delete next.comments

  return next
}

/**
 * A pattern in the shape Firestore will take.
 *
 * The same job `studyBody` and `planBody` do, and for the same reason: an `undefined`
 * value rejects the whole document rather than the field, so every optional field is
 * set or left out and never assigned. Whichever type it is, it is written with the
 * fields that type has and no others.
 */
export function patternBody(pattern: NewPattern): NewPattern {
  const type = typeOf(pattern as PatternRecord)

  const body: NewPattern = {
    name: pattern.name.trim(),
    kind: pattern.kind,
    type,
    conditions: pattern.conditions.filter(condition => condition.trim().length > 0),
    examples: pattern.examples.filter(lineHasContent).map(exampleBody),
    openingIds: [...new Set(pattern.openingIds)],
    createdAt: pattern.createdAt,
  }

  const motif = motifOf(pattern as PatternRecord)
  if (motif) body.motif = motif

  if (type === 'essentials') {
    const held = pattern.essentials ?? emptyEssentials()
    body.essentials = Object.fromEntries(
      ESSENTIALS_KEYS.map(key => [key, held[key].filter(point => point.trim().length > 0)]),
    ) as unknown as PatternEssentials

    const patternIds = [...new Set(pattern.patternIds ?? [])].filter(id => id.length > 0)
    if (patternIds.length > 0) body.patternIds = patternIds
  }

  return body
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
  /*
   * The tree has always carried a `startFen`; until now nothing ever gave it one but
   * the opening position. A line that is a position rather than a game hands it over
   * here, and everything downstream — the board, the move numbers, whose turn it is —
   * already reads from it.
   */
  const stored = (line.startFen ?? '').trim()
  // a FEN that will not read falls back to move one rather than throwing: this runs in a
  // render, and a hand-edited document must not be able to take the page down with it
  const start = stored.length > 0 && fenIsValid(stored) ? stored : undefined
  let tree = fromPgn(line.pgn ?? '', start)

  // a line stored before the PGN was kept, or one whose PGN failed to parse, still has
  // its parsed moves — rebuild from those rather than showing an empty board
  if (tree.children.length === 0 && line.moves.length > 0) {
    tree = fromPgn(line.moves.join(' '), start)
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
