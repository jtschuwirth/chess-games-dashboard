/**
 * Drilling the edges of a pattern, which is the part you cannot learn by looking.
 *
 * Showing a pattern's own diagram and asking what the idea is tests whether you remember
 * a picture, and you will be right every time within a week. Recognising Anastasia's Mate
 * in the position you wrote it up from is not the skill. **Seeing the f6 knight and
 * knowing the mate is off** is the skill, and that is exactly what questions 3a and 3b
 * already record.
 *
 * So the cards come from there, and the useful discovery is that **every boundary point
 * is already a complete card without anything new being written**. A point in `breaks`
 * is a change under which the pattern fails; one in `survives` is a change it works
 * through. The section the point is in *is* the answer — which makes this verifiable
 * rather than self-graded, and makes it work on every write-up already taken apart.
 *
 * A `fen` on the point upgrades the card rather than enabling it: with one, you are shown
 * the board and have to spot the change yourself; without one you are told the change in
 * words. The first is harder and better, and the second is what you get for free.
 */
import type { Color, PatternDrillStat, PatternLine, PatternRecord } from '@/types/chess'
import { ESSENTIALS_SECTIONS, lineHome, lineTree, pointId } from './pattern'
import { fenAt, mainLine, mainLineFrom, nodeAt } from './movetree'
import { sideToMove } from './board'

/** Which way the card's question is answered. */
export type PatternAnswer = 'works' | 'fails'

/** What a card asks of you. */
export type PatternCardKind = 'boundary' | 'line'

interface CardBase {
  /** `patternId:pointId`, the identity of one card across sessions. */
  key: string
  patternId: string
  /** What the drill record is filed under on the pattern. */
  pointId: string
  patternName: string
  stat: PatternDrillStat | null
  /** When it next falls due. A card never answered is due now. */
  due: number
}

export interface BoundaryCard extends CardBase {
  kind: 'boundary'
  /** The board the change was made to, when the point carries one. */
  fen: string | null
  /** The pattern's own position, for the reveal — what the change was made *to*. */
  originalFen: string | null
  /** Shown as the question when there is no board, and as the change once answered. */
  text: string
  /**
   * Why it breaks or survives, revealed with the answer. Null where none is written,
   * which is most of `survives` and is not a gap: the drill asks for the reason, and
   * only shows one where there was something worth saying.
   */
  why: string | null
  /** What the reason answers, in the method's own words, for the line above it. */
  asks: string
  /** `fails` for a point under 3a, `works` for one under 3b. */
  answer: PatternAnswer
  /** Which question it came from, for the reveal. */
  section: string
}

/**
 * Play the line, which is what an opening pattern is actually for.
 *
 * The boundary question — does the pattern still work here — is the right one for a
 * tactic, where the pattern is a shape you either see or miss. An opening pattern is
 * not a shape, it is a **sequence you are supposed to know**: the position comes up,
 * and what you need back is the moves. Asking whether it still works is asking nothing
 * about the thing you were trying to learn.
 *
 * So an `opening` write-up puts its examples in front of you instead. The position it
 * opens on, the name of the idea and the lines it is filed under — enough to remember
 * what this one is for — and then you play it out, move by move, with their replies
 * supplied from the example you wrote.
 */
export interface LineCard extends CardBase {
  kind: 'line'
  /** The position the example opens on, which is where you are asked to start. */
  fen: string
  /** Which end you play from, and therefore which plies of the line are yours. */
  orientation: Color
  /** The line from that position on — your moves and theirs, alternating. */
  moves: string[]
  /** What the example is called, held back until the line is played or given up. */
  title: string
  /** What you wrote about the line as a whole, revealed with it. */
  note: string | null
  /**
   * The saved openings the pattern names, as ids.
   *
   * Ids rather than names because this module knows nothing about the repertoire and
   * should not start: the page has the openings loaded and does the lookup.
   */
  openingIds: string[]
}

export type PatternCard = BoundaryCard | LineCard

/**
 * How far ahead a card goes after each right answer, in days.
 *
 * A plain ladder rather than SM-2's arithmetic. The thing being spaced is a handful of
 * boundaries per pattern, not a language course, and a schedule you can read off in one
 * line is a schedule you can reason about when it puts something in front of you too
 * often. Ninety days is the end of it: past that it is not a card any more.
 */
export const LADDER = [1, 3, 7, 16, 35, 90]

const DAY = 24 * 60 * 60 * 1000

/**
 * Where a card goes next.
 *
 * A miss drops to the bottom of the ladder rather than one rung down. The boundaries are
 * the whole point of the method, and getting one wrong means the pattern is not learned
 * in the way that matters — which is worth seeing again tomorrow rather than in a week.
 */
export function reschedule(
  stat: PatternDrillStat | null,
  correct: boolean,
  now: number,
): PatternDrillStat {
  const attempts = (stat?.attempts ?? 0) + 1
  const streak = correct ? (stat?.streak ?? 0) + 1 : 0
  const rung = Math.min(Math.max(streak - 1, 0), LADDER.length - 1)

  return {
    attempts,
    correct: (stat?.correct ?? 0) + (correct ? 1 : 0),
    lastAt: now,
    lastCorrect: correct,
    streak,
    due: now + (correct ? LADDER[rung] : 1) * DAY,
  }
}

/** The position a pattern's first example opens on, which is what a change is made to. */
function openingFen(pattern: PatternRecord): string | null {
  const example = pattern.examples[0]
  if (!example) return null
  try {
    const tree = lineTree(example)
    return fenAt(tree, lineHome(tree, example.startPly))
  } catch {
    return null
  }
}

/**
 * An id for an example, derived from the example itself.
 *
 * A `PatternLine` has never carried one — it is an entry in an array, identified by
 * where it sits — and a drill record keyed by position would move to a different
 * example the moment one was removed from the middle of the list. The same FNV-1a a
 * point without an id gets, over the only two things that make the line what it is: the
 * position it opens on and the moves played from it.
 *
 * Re-pointing or extending a line therefore starts a new card, which is the honest
 * answer: a line you have rewritten is not the line you had learned.
 */
export function lineCardId(line: PatternLine, moves: string[]): string {
  return `line:${pointId(`${line.startFen ?? ''}|${moves.join(' ')}`)}`
}

/**
 * The example as a card: where it opens, and what you have to play from there.
 *
 * Null for an example with no moves after its opening ply — a position on its own is a
 * complete *example*, and the page says so, but there is nothing to be asked for.
 */
function lineCard(pattern: PatternRecord, line: PatternLine): Omit<LineCard, 'stat' | 'due'> | null {
  let fen: string
  let moves: string[]

  try {
    const tree = lineTree(line)
    const home = lineHome(tree, line.startPly)
    const at = nodeAt(tree, home)
    fen = fenAt(tree, home)
    // what follows the ply the board opens on, down the line's own main line
    moves = at ? mainLineFrom(at).slice(1).map(node => node.san) : mainLine(tree)
  } catch {
    return null
  }

  if (moves.length === 0) return null

  return {
    kind: 'line',
    key: `${pattern.id}:${lineCardId(line, moves)}`,
    patternId: pattern.id,
    pointId: lineCardId(line, moves),
    patternName: pattern.name,
    fen,
    orientation: line.orientation ?? 'white',
    moves,
    title: line.title,
    note: line.note?.trim() || null,
    openingIds: pattern.openingIds ?? [],
  }
}

/**
 * Whether ply `index` of a line card is one of yours.
 *
 * The line alternates from the position it opens on, so the whole answer is who is to
 * move there. An example pointed at the opponent's move opens with their move played
 * for you, which is the same thing the drill does at every other step.
 */
export function yoursAt(card: LineCard, index: number): boolean {
  const youStart = sideToMove(card.fen) === card.orientation
  return youStart === (index % 2 === 0)
}

/** Every card a pattern offers, whether or not it is due. */
export function cardsOf(pattern: PatternRecord): PatternCard[] {
  const cards: PatternCard[] = []
  const original = openingFen(pattern)
  const drills = pattern.drills ?? {}

  for (const section of ESSENTIALS_SECTIONS) {
    // only the two halves of question 3 state something that can be right or wrong
    if (section.tone === 'neutral') continue
    const answer: PatternAnswer = section.tone === 'breaks' ? 'fails' : 'works'

    for (const point of pattern.essentials?.[section.key] ?? []) {
      if (point.text.trim().length === 0) continue
      const stat = drills[point.id] ?? null

      cards.push({
        kind: 'boundary',
        key: `${pattern.id}:${point.id}`,
        patternId: pattern.id,
        pointId: point.id,
        patternName: pattern.name,
        fen: point.fen ?? null,
        originalFen: original,
        text: point.text,
        why: point.why?.trim() || null,
        asks: section.asks ?? '',
        answer,
        section: section.short,
        stat,
        due: stat?.due ?? 0,
      })
    }
  }

  /*
    An opening write-up asks for its lines instead of its boundaries — the position
    comes up and what you need back is the moves, which is not a question "does it
    still work" can put to you. Its boundaries still make cards if any were written;
    the two kinds compose rather than replacing each other.
  */
  if (pattern.kind === 'opening') {
    for (const example of pattern.examples) {
      const card = lineCard(pattern, example)
      if (!card) continue
      const stat = drills[card.pointId] ?? null
      cards.push({ ...card, stat, due: stat?.due ?? 0 })
    }
  }

  return cards
}

/**
 * The cards to put in front of you now, soonest due first.
 *
 * A card never answered is due at 0, so new material leads — the same instinct the game
 * drill follows, for the same reason: a boundary you have never been asked about is the
 * one most likely to be the gap.
 *
 * **Then one write-up at a time, round the houses.** Every unanswered card is due at 0,
 * so the due order alone left them tied and the tie-break was the key — which begins
 * with the pattern id, so all nine of one write-up's boundaries arrived in a block.
 * Taking a write-up apart therefore *punished* you with a run of nine cards about one
 * idea, which is both the dullest way to meet them and the worst: the second card tells
 * you what the first was about. Interleaving by rank inside each pattern deals them
 * round instead, so every pattern's first boundary comes before any pattern's second.
 *
 * It only ever reorders cards that fall due **together**. A card genuinely due earlier
 * still leads, because the schedule is the point of the ladder.
 *
 * Nothing re-sorts mid-session. The queue is taken once and answered in that order, or
 * the next card would move while you were looking at it.
 */
export function dueCards(patterns: PatternRecord[], now: number): PatternCard[] {
  const seen = new Map<string, number>()

  return patterns
    .flatMap(cardsOf)
    .filter(card => card.due <= now)
    .sort((a, b) => a.due - b.due || a.key.localeCompare(b.key))
    .map(card => {
      const rank = seen.get(card.patternId) ?? 0
      seen.set(card.patternId, rank + 1)
      return { card, rank }
    })
    .sort((a, b) => a.card.due - b.card.due || a.rank - b.rank || a.card.key.localeCompare(b.card.key))
    .map(entry => entry.card)
}

/** Everything a pattern could ask, and how much of it is waiting. */
export function drillSummary(patterns: PatternRecord[], now: number) {
  const all = patterns.flatMap(cardsOf)
  const due = all.filter(card => card.due <= now)
  const unseen = all.filter(card => card.stat === null)
  const withBoard = all.filter(card => card.fen !== null)
  const withReason = all.filter(card => card.kind === 'boundary' && card.why !== null)
  const lines = all.filter(card => card.kind === 'line')

  return {
    total: all.length,
    due: due.length,
    unseen: unseen.length,
    withBoard: withBoard.length,
    withReason: withReason.length,
    lines: lines.length,
  }
}

/** Whether an answer was right. The section the point sits in is the truth. */
export function judge(card: BoundaryCard, said: PatternAnswer): boolean {
  return said === card.answer
}
