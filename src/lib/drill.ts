import { replayGame } from './board'
import { isFault, trainableMistakes } from './review'
import type { Color, DrillStat, GameRecord, ProposedMove } from '@/types/chess'

/**
 * Which positions to drill. `reviewed` is the set you have taken apart and written
 * alternatives for; `all` adds every position the engine flagged and you never got to,
 * where the engine's own move is the only answer available.
 */
export type DrillSource = 'reviewed' | 'all'

export function isDrillSource(value: string): value is DrillSource {
  return value === 'reviewed' || value === 'all'
}

export interface DrillCard {
  /** `gameId:ply`, the identity of one position across sessions. */
  key: string
  gameId: string
  ply: number
  /** The position to solve — the one you faced, before the move that went wrong. */
  fen: string
  /** The side you were playing, which is also the board's orientation. */
  color: Color
  moveNumber: number
  /** What you actually played. Held back until the answer is in. */
  played: string
  /** The engine's mark on that move, `??` or `?`. */
  playedTag: string | null
  /** Moves you proposed in review, with your reasoning. Empty for an unreviewed position. */
  proposed: ProposedMove[]
  /** Why you said it went wrong, shown once you have answered. */
  cause: string
  signal: string
  tags: string[]
  /** Your record on this position, null if it has never come up. */
  stat: DrillStat | null
  /** Context for the reveal. */
  opponent: string
  playedAt: number
  url: string
}

/** Never-seen first, then whatever you keep getting wrong, then the longest ago. */
function drillRank(card: DrillCard): number {
  if (!card.stat || card.stat.attempts === 0) return -1
  return card.stat.correct / card.stat.attempts
}

/**
 * The positions to put in front of you, hardest first.
 *
 * A move you marked as beyond reasonable reach is never drilled: you already decided
 * there was nothing to find, and asking again would only teach you to distrust the
 * mark. In `all`, a position is worth drilling if the engine called it a blunder or a
 * mistake — the same two marks the rest of the app shows.
 */
export function buildDrillCards(games: GameRecord[], source: DrillSource): DrillCard[] {
  const cards: DrillCard[] = []

  for (const game of games) {
    const reviewed = new Map(
      trainableMistakes(game.review).map(mistake => [mistake.ply, mistake]),
    )

    // the engine still flags a move you marked beyond reach, so it has to be subtracted
    // from the `all` set explicitly or the escape hatch leaks back in as a drill
    const beyondReach = new Set(
      (game.review?.mistakes ?? []).filter(entry => entry.unreasonable).map(entry => entry.ply),
    )

    const plies =
      source === 'reviewed'
        ? [...reviewed.keys()]
        : [
            ...new Set([
              ...reviewed.keys(),
              ...(game.analysis?.moves ?? [])
                .filter(move => isFault(move.tag) && !beyondReach.has(move.ply))
                .map(move => move.ply),
            ]),
          ]

    if (plies.length === 0) continue

    // one replay per game, reused by every position drawn from it
    const { fens } = replayGame(game.moves)
    const tags = new Map((game.analysis?.moves ?? []).map(move => [move.ply, move.tag]))

    for (const ply of plies.sort((a, b) => a - b)) {
      const fen = fens[ply]
      if (!fen) continue

      const mistake = reviewed.get(ply)
      cards.push({
        key: `${game.id}:${ply}`,
        gameId: game.id,
        ply,
        fen,
        color: game.color,
        moveNumber: Math.floor(ply / 2) + 1,
        played: mistake?.san ?? game.moves[ply] ?? '',
        playedTag: tags.get(ply) ?? null,
        proposed: mistake?.betterMoves ?? [],
        cause: mistake?.cause ?? '',
        signal: mistake?.signal ?? '',
        tags: mistake?.tags ?? [],
        stat: game.drills?.[String(ply)] ?? null,
        opponent: game.opponent,
        playedAt: game.playedAt,
        url: game.url,
      })
    }
  }

  return cards.sort((a, b) => drillRank(a) - drillRank(b) || (a.stat?.lastAt ?? 0) - (b.stat?.lastAt ?? 0))
}

/**
 * How an answer turned out.
 *
 * `holds` is a pass on purpose. The point was never to recite the engine's first
 * choice — it was to find something that keeps the game alive instead of a blunder —
 * so a move that gives nothing away counts, even when it is not one you wrote down.
 */
export type DrillVerdict = 'yours' | 'engine' | 'holds' | 'miss'

export function judgeAttempt(
  card: DrillCard,
  san: string,
  engineBestSan: string | null,
  tag: string,
): DrillVerdict {
  if (card.proposed.some(move => move.san === san)) return 'yours'
  if (engineBestSan && san === engineBestSan) return 'engine'
  return isFault(tag) ? 'miss' : 'holds'
}

export function isPass(verdict: DrillVerdict): boolean {
  return verdict !== 'miss'
}

/** Folds an attempt into the record kept for that position. */
export function recordAttempt(stat: DrillStat | null, correct: boolean, now: number): DrillStat {
  return {
    attempts: (stat?.attempts ?? 0) + 1,
    correct: (stat?.correct ?? 0) + (correct ? 1 : 0),
    lastAt: now,
    lastCorrect: correct,
  }
}

export interface TagScore {
  tag: string
  attempts: number
  correct: number
  /** Positions carrying this tag that you have never been asked about. */
  untried: number
}

export interface DrillProgress {
  /** Positions available in the current selection. */
  positions: number
  tried: number
  /** Positions whose most recent attempt was right — what is sticking. */
  sticking: number
  attempts: number
  correct: number
  byTag: TagScore[]
}

/**
 * What is sticking and what is not. Scored by tag as well as overall, since the tags
 * are the whole reason for writing reviews down: "I keep missing back-rank ideas" is
 * actionable in a way that "62%" is not.
 */
export function drillProgress(cards: DrillCard[]): DrillProgress {
  const byTag = new Map<string, TagScore>()
  let tried = 0
  let sticking = 0
  let attempts = 0
  let correct = 0

  for (const card of cards) {
    if (card.stat && card.stat.attempts > 0) {
      tried++
      attempts += card.stat.attempts
      correct += card.stat.correct
      if (card.stat.lastCorrect) sticking++
    }

    for (const tag of card.tags) {
      const score = byTag.get(tag) ?? { tag, attempts: 0, correct: 0, untried: 0 }
      if (card.stat && card.stat.attempts > 0) {
        score.attempts += card.stat.attempts
        score.correct += card.stat.correct
      } else {
        score.untried++
      }
      byTag.set(tag, score)
    }
  }

  return {
    positions: cards.length,
    tried,
    sticking,
    attempts,
    correct,
    // worst first, and a tag you have never been asked about sorts last
    byTag: [...byTag.values()].sort(
      (a, b) =>
        (a.attempts === 0 ? 2 : a.correct / a.attempts) -
          (b.attempts === 0 ? 2 : b.correct / b.attempts) || b.attempts - a.attempts,
    ),
  }
}
