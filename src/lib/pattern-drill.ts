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
import type { PatternDrillStat, PatternRecord } from '@/types/chess'
import { ESSENTIALS_SECTIONS, lineHome, lineTree } from './pattern'
import { fenAt } from './movetree'

/** Which way the card's question is answered. */
export type PatternAnswer = 'works' | 'fails'

export interface PatternCard {
  /** `patternId:pointId`, the identity of one card across sessions. */
  key: string
  patternId: string
  pointId: string
  patternName: string
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
  stat: PatternDrillStat | null
  /** When it next falls due. A card never answered is due now. */
  due: number
}

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

  return cards
}

/**
 * The cards to put in front of you now, soonest due first.
 *
 * A card never answered is due at 0, so new material leads — the same instinct the game
 * drill follows, for the same reason: a boundary you have never been asked about is the
 * one most likely to be the gap.
 *
 * Nothing re-sorts mid-session. The queue is taken once and answered in that order, or
 * the next card would move while you were looking at it.
 */
export function dueCards(patterns: PatternRecord[], now: number): PatternCard[] {
  return patterns
    .flatMap(cardsOf)
    .filter(card => card.due <= now)
    .sort((a, b) => a.due - b.due || a.key.localeCompare(b.key))
}

/** Everything a pattern could ask, and how much of it is waiting. */
export function drillSummary(patterns: PatternRecord[], now: number) {
  const all = patterns.flatMap(cardsOf)
  const due = all.filter(card => card.due <= now)
  const unseen = all.filter(card => card.stat === null)
  const withBoard = all.filter(card => card.fen !== null)
  const withReason = all.filter(card => card.why !== null)

  return {
    total: all.length,
    due: due.length,
    unseen: unseen.length,
    withBoard: withBoard.length,
    withReason: withReason.length,
  }
}

/** Whether an answer was right. The section the point sits in is the truth. */
export function judge(card: PatternCard, said: PatternAnswer): boolean {
  return said === card.answer
}
