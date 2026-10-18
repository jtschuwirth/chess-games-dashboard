import { SEVERITY_MARK } from './bands'
import { settings, type Severity } from './settings'
import { tagGroupOf, tagIds, tagName, type TagGroup } from './tags'
import type {
  Color,
  GameRecord,
  GameReview,
  MistakeRepeat,
  MoveNote,
  ProposedMove,
  ReviewedMistake,
  StoredAnalysis,
} from '@/types/chess'

/**
 * A review names one to three moves. The cap is the whole method: a post-mortem that
 * blames every move explains nothing, so you are forced to pick the moves that
 * actually decided the game.
 */
/**
 * How many moves one review may take apart. A post-mortem that blames every move
 * explains nothing, so the cap forces a choice.
 *
 * It counts entries, not moves: an entry can carry repeats — the same mistake played
 * again before you saw it — and those are free. The cap is there to stop you writing
 * three unrelated explanations, not to stop one explanation covering the four moves it
 * actually covers.
 */
export const MAX_REVIEW_MISTAKES = 3

/**
 * Which group a tag belongs to, under the account's own vocabulary.
 *
 * The vocabulary moved to `lib/tags.ts` and onto the user document when it stopped being
 * the app's list and became yours. This stays here because everything that *counts* tags
 * is here, and it is one line: the group is derived at read time, never stored on a
 * review, so re-filing a tag re-files every entry already carrying it.
 */
export function tagGroup(tag: string, patternTags?: Set<string>, groups?: TagGroup[]): string {
  return tagGroupOf(tag, patternTags, groups)
}

/**
 * The proposed lines of an entry, whichever shape they were stored in. This field has
 * had three: a plain SAN string, then `{ san, why }`, now `{ line, why }`. Firestore
 * keeps what it was given, so each older shape is converted on read rather than
 * migrated, the same way pre-game ratings and the variation tree are derived.
 */
export function betterMovesOf(mistake: ReviewedMistake): ProposedMove[] {
  return (mistake.betterMoves ?? []).map(move => {
    if (typeof move === 'string') return { line: [move], why: '' }

    const legacy = move as ProposedMove & { san?: string }
    if (Array.isArray(legacy.line)) return { line: legacy.line, why: legacy.why ?? '' }
    return { line: legacy.san ? [legacy.san] : [], why: legacy.why ?? '' }
  })
}

/**
 * The move a line actually commits you to. Everything after it depends on the opponent
 * playing along, so this is the only part that can be judged, or asked for in a drill.
 */
export function firstMoveOf(move: ProposedMove): string | null {
  return move.line[0] ?? null
}

/**
 * A game counts as reviewed once you have written something about it — entries, or
 * just a note. A game where nothing went wrong still deserves to be marked as looked
 * at, otherwise it keeps coming back as unfinished business.
 */
export function hasReview(game: GameRecord): boolean {
  const review = game.review
  if (!review) return false
  return (
    review.mistakes.length > 0 ||
    review.notes.trim().length > 0 ||
    moveNotesOf(review).length > 0
  )
}

/**
 * An engine reading turned into your frame.
 *
 * `analyzePosition` scores for the side to move, so a reading taken at the position
 * before a move comes back in the frame of whoever plays that move — yours on your
 * move, your opponent's on theirs. Everything stored here and every rule that reads it
 * is in your frame, so theirs is flipped.
 *
 * It is a named function with two callers rather than a minus sign written out twice.
 * Sign conventions are what this codebase has got wrong before — the lichess rating
 * diff, the clock alignment — and both times it was the same shape of mistake: one
 * reader assuming a frame the writer did not mean.
 */
export function fromMover(cp: number, yours: boolean): number {
  return yours ? cp : -cp
}

/**
 * The notes written on individual moves, normalised on read.
 *
 * Same habit as `betterMovesOf` and `repeatsOf`: reviews written before move notes
 * existed have no field, and nothing downstream should have to know that.
 */
export function moveNotesOf(review: GameReview | undefined): MoveNote[] {
  return review?.moveNotes ?? []
}

/**
 * Whether a note says anything. An entry with no text, no tag and no line is one you
 * started and left — dropped on save rather than refused in the form, the same way a
 * pattern drops an example you never filled in.
 */
export function noteHasContent(note: MoveNote): boolean {
  return (
    note.note.trim().length > 0 ||
    note.tags.length > 0 ||
    note.alternatives.some(move => move.line.length > 0)
  )
}

/**
 * The tags your notes carry, de-duplicated within the game.
 *
 * Deliberately separate from `tagsOf`, which feeds the Mistake database and the tag
 * filter. The same word means two opposite things in the two places — `hanging piece`
 * on a mistake is one you missed, on a note it is one you spotted — and folding them
 * into one count would make every figure in that table mean "times this came up",
 * which is not what anyone reads it as.
 */
export function noteTagsOf(game: GameRecord): string[] {
  const tags = new Set<string>()
  for (const note of moveNotesOf(game.review)) {
    for (const tag of note.tags) tags.add(tag)
  }
  return [...tags]
}

/**
 * The entries that describe a trainable pattern. A move marked unreasonable is left
 * out: the engine's objection stands, but there is nothing to practise, and counting
 * it would inflate whatever tag happens to sit on it.
 */
export function trainableMistakes(review: GameReview | undefined): ReviewedMistake[] {
  return (review?.mistakes ?? []).filter(mistake => !mistake.unreasonable)
}

/**
 * The moves an entry covers besides its own, normalised on read.
 *
 * Same habit as `betterMovesOf` and the pre-game ratings: reviews written before repeats
 * existed have no field, and they are not wrong for lacking one.
 */
export function repeatsOf(mistake: ReviewedMistake): MistakeRepeat[] {
  return mistake.repeats ?? []
}

/**
 * Every ply a review speaks about: the entries, everything they cover, and the moves
 * you noted. The move list marks these, and a move you wrote a note on is one the
 * review speaks about as much as one you took apart.
 */
export function reviewedPlies(review: GameReview | undefined): Set<number> {
  const plies = new Set<number>()
  for (const mistake of review?.mistakes ?? []) {
    plies.add(mistake.ply)
    for (const repeat of repeatsOf(mistake)) plies.add(repeat.ply)
  }
  for (const note of moveNotesOf(review)) plies.add(note.ply)
  return plies
}

/**
 * Tags a game contributes to the pattern counts, de-duplicated within the game.
 *
 * A repeat adds nothing here, which is the point of it being a repeat: four moves of one
 * idea you did not see is one thing to train, and counting it four times would let a
 * single bad evening outweigh a month.
 */
export function tagsOf(game: GameRecord): string[] {
  const tags = new Set<string>()
  for (const mistake of trainableMistakes(game.review)) {
    for (const tag of mistake.tags) tags.add(tag)
  }
  return [...tags]
}

/**
 * Tags written on your reviews that the vocabulary does not offer, worst first.
 *
 * This used to feed the review form, where it was the free-text escape hatch offering
 * your own inventions back to you — and so the thing that let the vocabulary drift. It
 * feeds the maintainer instead: the same list, read as a question rather than an answer.
 * These are the tags with nowhere to live, each one either worth filing under a group or
 * worth leaving in the past.
 *
 * Both mistakes and move notes, because a tag invented on a note counts the same.
 */
export function unfiledTags(
  games: GameRecord[],
  groups?: TagGroup[],
  patternTags?: Set<string>,
): { tag: string; count: number }[] {
  const offered = tagIds(groups)
  const counts = new Map<string, number>()

  const add = (written: string[]) => {
    for (const tag of written) {
      if (offered.has(tag) || patternTags?.has(tag)) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  for (const game of games) {
    for (const mistake of game.review?.mistakes ?? []) add(mistake.tags)
    for (const note of moveNotesOf(game.review)) add(note.tags)
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export interface TagTally {
  /** The stored id: what reviews carry, and what a `?tag=` link names. */
  tag: string
  /** What it is called now. The id is the identity; this is the only thing to print. */
  name: string
  group: string
  /** How many entries carry this tag. */
  count: number
  /** How many games — a tag twice in one game is one game. */
  games: number
  /** Results of the games carrying it, so a frequent tag that costs nothing shows up. */
  losses: number
}

/** The mistake database: which ideas keep appearing, worst first. */
export function aggregateTags(
  games: GameRecord[],
  patternTags?: Set<string>,
  groups?: TagGroup[],
): TagTally[] {
  const counts = new Map<string, { count: number; games: Set<string>; losses: number }>()

  for (const game of games) {
    for (const mistake of trainableMistakes(game.review)) {
      for (const tag of mistake.tags) {
        const entry = counts.get(tag) ?? { count: 0, games: new Set<string>(), losses: 0 }
        entry.count++
        if (!entry.games.has(game.id)) {
          entry.games.add(game.id)
          if (game.result === 'loss') entry.losses++
        }
        counts.set(tag, entry)
      }
    }
  }

  return [...counts.entries()]
    .map(([tag, entry]) => ({
      tag,
      name: tagName(tag, groups),
      group: tagGroup(tag, patternTags, groups),
      count: entry.count,
      games: entry.games.size,
      losses: entry.losses,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export interface ReviewSummary {
  /** Games in the slice carrying a review. */
  reviewed: number
  /** Analysed games with a blunder or mistake and no review yet. */
  waiting: number
  /** Entries written, trainable ones only. */
  mistakes: number
  /** Entries you marked as beyond reasonable reach. */
  unreasonable: number
  /** Trainable entries carrying no tag, which contribute nothing to the counts. */
  untagged: number
}

export function reviewSummary(games: GameRecord[]): ReviewSummary {
  let reviewed = 0
  let mistakes = 0
  let unreasonable = 0
  let untagged = 0

  for (const game of games) {
    if (!hasReview(game)) continue
    reviewed++

    for (const mistake of game.review?.mistakes ?? []) {
      if (mistake.unreasonable) unreasonable++
      else {
        mistakes++
        if (mistake.tags.length === 0) untagged++
      }
    }
  }

  return { reviewed, waiting: reviewQueue(games).length, mistakes, unreasonable, untagged }
}

/**
 * Games the engine flagged and you have not taken apart yet, heaviest first. This is
 * what turns an analysis run into a reading list: the engine says where to look, the
 * review says why it happened.
 */
export function reviewQueue(games: GameRecord[]): GameRecord[] {
  return games
    .filter(game => !hasReview(game) && engineFindings(game) > 0)
    .sort((a, b) => engineFindings(b) - engineFindings(a) || b.playedAt - a.playedAt)
}

function engineFindings(game: GameRecord): number {
  const analysis = game.analysis
  if (!analysis) return 0
  // a blunder is worth more attention than a mistake, so it sorts first
  return analysis.blunders * 10 + analysis.mistakes
}

/**
 * The marks worth putting on screen, and the only moves offered up for review.
 *
 * `!` and `!!` are out because they only mean the move matched the engine's first
 * choice, which is true of most book moves. `?!` is out for a sharper reason: it is
 * precisely the tag `classifyMove` gives a costly move whose *context* says it did not
 * matter — you were still winning easily afterwards, or already lost. +12.4 to +9.8 is
 * a `?!`, and there is nothing in it to study. What is left is what the thresholds
 * judged to have actually cost something.
 */
export const FAULT_TAGS = ['??', '?']

/**
 * Whether a mark is one you want to see.
 *
 * It used to be a fixed list of two. Now the grade comes from the band a move fell out
 * of, so an inaccuracy is a move the position excused rather than a move that cost a
 * little — and whether that is worth looking at is a matter of taste. `marks` on the
 * account decides; the default is still `??` and `?`, which is what it has always shown.
 */
export function isFault(tag: string, marks = settings().marks): boolean {
  const severity = (Object.keys(SEVERITY_MARK) as Severity[]).find(
    key => SEVERITY_MARK[key] === tag,
  )
  return severity !== undefined && marks.includes(severity)
}

/**
 * What colour a mark is written in: `??` red, `?` amber, `?!` muted, anything else plain.
 *
 * One map, because the marks are a severity scale and a scale only works if it means the
 * same thing everywhere. It was copied into two components and hardcoded in two more, and
 * both hardcodes were wrong in opposite directions.
 */
const MARK_COLOR: Record<string, string> = {
  '??': 'text-red-400',
  '?': 'text-amber-400',
  '?!': 'text-zinc-500',
}

export function markColor(tag: string | null | undefined): string {
  return (tag && MARK_COLOR[tag]) || 'text-zinc-500'
}

/**
 * The same scale drawn as a filled badge rather than written as ink.
 *
 * Beside `MARK_COLOR` rather than in the board, for the reason that map exists at all:
 * the marks are a severity scale and a scale only works if it means the same thing
 * everywhere. The colours are a step stronger than the text ones because these sit on a
 * light board square rather than on a dark panel, and the ink is whichever of white or
 * near-black reads on the fill — a chip you cannot read the mark on is a coloured dot.
 */
const MARK_BADGE: Record<string, { fill: string; ink: string; label: string }> = {
  '??': { fill: '#e04b43', ink: '#ffffff', label: 'blunder' },
  '?': { fill: '#e0a23c', ink: '#1c1917', label: 'mistake' },
  '?!': { fill: '#a1a1aa', ink: '#1c1917', label: 'inaccuracy' },
}

export function markBadge(tag: string | null | undefined) {
  return (tag && MARK_BADGE[tag]) || null
}

export interface MistakeCandidate {
  ply: number
  san: string
  moveNumber: number
  cpBefore: number
  cpAfter: number
  cpLoss: number
  tag: string
}

/** The engine's own objections, worst first — the moves offered up for review. */
export function candidateMoves(analysis: StoredAnalysis | undefined): MistakeCandidate[] {
  return (analysis?.moves ?? [])
    .filter(move => isFault(move.tag))
    .sort((a, b) => b.cpLoss - a.cpLoss)
    .map(move => ({
      ply: move.ply,
      san: move.san,
      moveNumber: move.moveNumber,
      cpBefore: move.cpBefore,
      cpAfter: move.cpAfter,
      cpLoss: move.cpLoss,
      tag: move.tag,
    }))
}

/**
 * What still has to be filled in. An unreasonable move needs nothing — that is the
 * point of the mark — but any other entry needs a cause and at least one tag, or it
 * adds a row to the database that says nothing.
 */
export function missingFrom(mistake: ReviewedMistake): string | null {
  if (mistake.unreasonable) return null
  if (mistake.cause.trim().length === 0) return 'say why it is a mistake'
  if (mistake.tags.length === 0) return 'add at least one tag'
  return null
}

/**
 * Formats a number already in White's frame: +1.8, −0.4, +M. Stored evaluations are
 * *not* in that frame, so reach for `formatEval` instead — this one is the plain
 * formatter underneath it.
 */
export function formatCp(cp: number | null): string {
  if (cp === null) return '—'
  if (Math.abs(cp) >= 9000) return cp > 0 ? '+M' : '−M'

  const pawns = cp / 100
  const shown = Math.abs(pawns).toFixed(1)
  // a couple of centipawns either way rounds to nothing, and "−0.0" reads as a bug
  const sign = shown === '0.0' ? '' : pawns > 0 ? '+' : '−'
  return `${sign}${shown}`
}

/**
 * An evaluation as a board shows it: positive favours White, negative favours Black,
 * whichever side you played.
 *
 * Everything stored is from *your* point of view, because that is what the classifier
 * reasons about — `cpLoss` has to mean what you gave away, and the guards in
 * `classifyMove` ask whether *you* were already lost. But a Black player reading −2.2
 * on a board reads "I am winning", so showing a stored number raw inverts its meaning
 * for half of your games. The sign is flipped here, at the point of display, and
 * nowhere else.
 */
export function formatEval(cp: number | null, color: Color): string {
  if (cp === null) return '—'
  return formatCp(color === 'white' ? cp : -cp)
}
