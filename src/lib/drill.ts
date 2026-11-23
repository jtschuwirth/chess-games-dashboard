import { playMove, replayGame } from './board'
import { isDrillable, toPlay } from './exercise'
import { mainLine } from './movetree'
import { commentedNodes, lineTree } from './pattern'
import { betterMovesOf, firstMoveOf, isFault, playableMoves, trainableMistakes } from './review'
import type {
  Color,
  DrillStat,
  ExerciseGuide,
  GameRecord,
  ProposedMove,
  ReviewedMistake,
} from '@/types/chess'

/**
 * Which positions to drill. `reviewed` is the set you have taken apart and written
 * alternatives for; `all` adds every position the engine flagged and you never got to,
 * where the engine's own move is the only answer available. `starred` is the other
 * direction — the reviewed moves you marked as worth meeting again, which is you
 * writing yourself a sheet out of your own games.
 *
 * `exercises` is every solved position off your coach's sheets and `starred-sheets` is
 * the same thing narrowed to the sheets you starred. The star is on the **guide** there
 * rather than on each position, because a sheet is the unit you choose between: this
 * handout and not that chapter.
 */
export type DrillSource = 'reviewed' | 'starred' | 'all' | 'exercises' | 'starred-sheets'

const SOURCE_VALUES: DrillSource[] = [
  'reviewed',
  'starred',
  'all',
  'exercises',
  'starred-sheets',
]

export function isDrillSource(value: string): value is DrillSource {
  return (SOURCE_VALUES as string[]).includes(value)
}

/** Whether a source draws on the guides rather than on the games. */
export function fromGuides(source: DrillSource): boolean {
  return source === 'exercises' || source === 'starred-sheets'
}

/**
 * The sheets a source draws on, which is the whole of what the star does here.
 *
 * A sheet with no star is not excluded from `exercises` — the star says which to drill
 * *now*, not which are worth drilling, so turning one off must never take a position out
 * of the full set.
 */
export function sheetsToDrill(guides: ExerciseGuide[], source: DrillSource): ExerciseGuide[] {
  return source === 'starred-sheets' ? guides.filter(guide => guide.starred) : guides
}

/**
 * What an exercise card carries that a game card has no equivalent of.
 *
 * A game position comes with a move you actually played and a post-mortem of why it was
 * wrong; an exercise comes with a sheet it belongs to and the write-up you made of the
 * answer. The reveal is the difference, so this is what the reveal needs and nothing
 * else — and a game card simply has none of it.
 */
export interface ExerciseOrigin {
  guideId: string
  guideName: string
  exerciseId: string
  title: string
  /** What you wrote about the exercise as a whole, shown once you have answered. */
  notes: string
  /** What you wrote on each move of the solution, in the order they are played. */
  comments: { san: string; text: string }[]
}

export interface DrillCard {
  /** `gameId:ply` or `guideId:exerciseId`: the identity of one position across sessions. */
  key: string
  /**
   * Where the card came from, which decides how it is judged and what the reveal shows.
   *
   * A game position is judged by whether the move **holds**, because the method there is
   * finding something that keeps the game alive rather than reciting a line. An exercise
   * is a puzzle: holding is not the answer, the idea is, and most of these positions are
   * winning already — so nearly anything would hold and the drill would pass you for
   * declining the sacrifice the sheet is about.
   */
  from: 'game' | 'exercise'
  /** Only on an exercise card. */
  origin?: ExerciseOrigin
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
  intent: string
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

/**
 * How likely a position is to come up, which is not the same as how badly you need it.
 *
 * Hardest-first was the rule and it had one failure mode that mattered: the order was a
 * *total* one, so the same three positions opened every session and the tail was never
 * reached at all. The thing wanted here is variety with a bias, so the weight is a
 * share of the deal rather than a place in a queue.
 *
 * A position you have never seen weighs a full 1. One you have seen weighs by how often
 * you miss it, floored at `SETTLED_WEIGHT` so a position you always get right still
 * turns up occasionally — it is dropping out of the rotation that would make a drill
 * stop finding what has gone stale. Getting it right *last time* halves it again, which
 * is the one thing a rate cannot say: six right and one wrong reads the same whichever
 * order they came in.
 */
const SETTLED_WEIGHT = 0.15

export function drillWeight(stat: DrillStat | null): number {
  if (!stat || stat.attempts === 0) return 1

  const missRate = 1 - stat.correct / stat.attempts
  const weight = SETTLED_WEIGHT + (1 - SETTLED_WEIGHT) * missRate
  return stat.lastCorrect ? weight / 2 : weight
}

/** FNV-1a over the card's own key, so one card's draw does not depend on the others'. */
function keyHash(key: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** A number in (0,1) for this card in this session, stable across every render of it. */
function draw(key: string, seed: number): number {
  let state = keyHash(key, seed)
  state = Math.imul(state ^ (state >>> 15), state | 1) >>> 0
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
  return (((state ^ (state >>> 14)) >>> 0) + 0.5) / 0x100000000
}

/**
 * The order to deal the cards in: random, weighted by `drillWeight`.
 *
 * Weighted sampling without replacement, by the standard key `u^(1/w)` taken largest
 * first — which is one sort rather than a loop that re-normalises after every pick, and
 * gives every card a chance at every position with the weights deciding the odds.
 *
 * It takes a **seed** rather than calling `Math.random` so that the order is a function
 * of its inputs: the queue is built in a memo and read on every render, and an order
 * that redrew itself would move the next card while you were looking at this one — the
 * rule the old sort already kept by being deterministic. A new seed is a new session,
 * which is what going round again asks for.
 */
export function shuffleByWeight(cards: DrillCard[], seed: number): DrillCard[] {
  return [...cards]
    .map(card => ({
      card,
      key: Math.pow(draw(card.key, seed), 1 / drillWeight(card.stat)),
    }))
    .sort((a, b) => b.key - a.key)
    .map(entry => entry.card)
}

/**
 * The positions available to drill, in the games' own order.
 *
 * The order you *meet* them in is `shuffleByWeight`, which the caller applies once per
 * session: a builder cannot own it, since the order has to be a function of a seed the
 * session holds rather than of the moment the list happened to be built.
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
        : source === 'starred'
          ? [...reviewed.values()].filter(mistake => mistake.starred).map(mistake => mistake.ply)
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
        /*
          Only the lines you said you would play. A line you wrote down to rule out —
          "Nc6 loses to Bxd4" — is not an answer, and counting it as one would mark
          the drill correct for the move you had already worked out was wrong.
        */
        proposed: playableMoves(
          betterMovesOf(mistake ?? ({ betterMoves: [] } as unknown as ReviewedMistake)),
        ),
        intent: mistake?.intent ?? '',
        cause: mistake?.cause ?? '',
        signal: mistake?.signal ?? '',
        tags: mistake?.tags ?? [],
        stat: game.drills?.[String(ply)] ?? null,
        opponent: game.opponent,
        playedAt: game.playedAt,
        url: game.url,
        from: 'game',
      })
    }
  }

  return cards
}

/**
 * One position the drill asks about, along a line you wrote in review.
 *
 * The first step is the position the game was in; every later one is further down your
 * own line, reached by playing your move and then the reply **you wrote for them**. That
 * is the honest caveat and the reason only the first move was ever asked for before: the
 * continuation depends on the opponent playing along, and here they play along because
 * you said they would. It is still worth asking — the line is the plan you were counting
 * on, and a plan you cannot produce past its first move is not a plan you had — so the
 * card names whose move the reply was rather than letting it look like the engine's.
 */
export interface DrillStep {
  /** The position to solve. */
  fen: string
  /** Their move that led here, from your own line. Null on the first step. */
  reply: string | null
  /** The move your line plays here. Empty on a card with no line to follow. */
  expected: string
  /** Where this sits in the game's own numbering, so the label reads `24… Qxe7`. */
  ply: number
  /** The reply's two squares, for the board to mark. Empty on the first step. */
  highlight: string[]
}

/**
 * The line an answer puts you on — the one whose first move you just played.
 *
 * The longest of them when several start the same way, since the question being asked is
 * how much of it you know. Null when the move is not one you wrote down, and then there
 * is nothing to follow: a move that holds is still a pass, it just has no continuation of
 * yours to ask about.
 */
export function lineFor(card: DrillCard, san: string): string[] | null {
  const matching = card.proposed
    .filter(move => firstMoveOf(move) === san)
    .map(move => move.line)

  if (matching.length === 0) return null
  return matching.reduce((longest, line) => (line.length > longest.length ? line : longest))
}

/**
 * Your own moves along a line, each with the position it is played from.
 *
 * A line alternates — yours, theirs, yours — so your moves are the even indices and the
 * step between two of them is a pair. A move that will not play from the position it
 * reaches ends the walk there rather than throwing: a stored line is text somebody typed,
 * and `MAX_LINE_PLIES` validation kept the legal prefix rather than the whole row.
 */
export function stepsAlong(fen: string, ply: number, line: string[]): DrillStep[] {
  const steps: DrillStep[] = []
  let position = fen
  let reply: string | null = null
  let highlight: string[] = []

  for (let index = 0; index < line.length; index += 2) {
    const expected = line[index]
    if (!expected) break

    steps.push({ fen: position, reply, expected, ply: ply + index, highlight })

    const mine = playMove(position, expected)
    if (!mine) break

    const answer = line[index + 1]
    if (!answer) break

    const theirs = playMove(mine.fen, answer)
    if (!theirs) break

    position = theirs.fen
    reply = answer
    highlight = [theirs.from, theirs.to]
  }

  return steps
}

/**
 * The exercises you have worked out, as positions to find again.
 *
 * **Solved only**, which is the point: an exercise you have not done yet is one this
 * would spoil, and a sheet from a coach is something you go through in your own time.
 * The line you wrote *is* the answer, so it is handed over as the one proposed move —
 * which means the walk down a line, the cursor, the judging and the follow-up all work
 * here with nothing new, because an exercise was always a position with moves on top of
 * it and so was an alternative you wrote in a review.
 *
 * Dealt by the same rule as the games, which the caller applies: `shuffleByWeight`.
 */
export function buildExerciseCards(guides: ExerciseGuide[]): DrillCard[] {
  const cards: DrillCard[] = []

  for (const guide of guides) {
    for (const exercise of guide.exercises) {
      if (!isDrillable(exercise)) continue

      const tree = lineTree(exercise.line)
      const line = mainLine(tree)
      if (line.length === 0) continue

      const color = toPlay(exercise)
      const index = guide.exercises.indexOf(exercise)

      cards.push({
        key: `${guide.id}:${exercise.id}`,
        from: 'exercise',
        origin: {
          guideId: guide.id,
          guideName: guide.name,
          exerciseId: exercise.id,
          title: exercise.line.title.trim() || `Exercise ${index + 1}`,
          notes: exercise.line.note,
          comments: commentedNodes(tree).map(entry => ({ san: entry.san, text: entry.text })),
        },
        // a game's identifiers have no meaning here, and nothing reads them on this side
        gameId: guide.id,
        ply: 0,
        fen: tree.startFen,
        color,
        moveNumber: Number(tree.startFen.split(/\s+/)[5] ?? 1) || 1,
        played: '',
        playedTag: null,
        /* the line you wrote is the answer, which is exactly a proposed move */
        proposed: [{ line, why: '' }],
        intent: '',
        cause: '',
        signal: '',
        tags: [],
        stat: guide.drills?.[exercise.id] ?? null,
        opponent: guide.name,
        playedAt: guide.updatedAt ?? guide.createdAt,
        url: '',
      })
    }
  }

  return cards
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
  if (card.proposed.some(move => firstMoveOf(move) === san)) return 'yours'
  if (engineBestSan && san === engineBestSan) return 'engine'
  return isFault(tag) ? 'miss' : 'holds'
}

/**
 * The same judgement one move further down your own line.
 *
 * `yours` means the move your line actually plays here, which is what the follow-up is
 * asking for. Anything else that holds still passes, by the rule the first move already
 * follows — finding something that keeps the game alive was never meant to mean reciting
 * one — and it ends the sequence, because you have left the line there is nothing more of
 * yours to ask for.
 */
export function judgeFollowUp(
  expected: string,
  san: string,
  engineBestSan: string | null,
  tag: string,
): DrillVerdict {
  if (san === expected) return 'yours'
  if (engineBestSan && san === engineBestSan) return 'engine'
  return isFault(tag) ? 'miss' : 'holds'
}

/**
 * The same judgement on an exercise, where holding is not enough.
 *
 * A game position asks you to keep the game alive, so anything that gives nothing away
 * counts. An exercise asks you to find the idea, and most of these positions are already
 * winning — so under the holding rule you could decline the sacrifice the whole sheet is
 * about, stay two pawns up and be told you were right. The move your solution plays is
 * the answer; the engine's own first choice also passes, because a position can have two
 * and your write-up only recorded one.
 */
export function judgeExercise(
  expected: string,
  san: string,
  engineBestSan: string | null,
): DrillVerdict {
  if (san === expected) return 'yours'
  if (engineBestSan && san === engineBestSan) return 'engine'
  return 'miss'
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
