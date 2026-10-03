import type {
  Color,
  GameRecord,
  GameReview,
  ProposedMove,
  ReviewedMistake,
  StoredAnalysis,
} from '@/types/chess'

/**
 * A review names one to three moves. The cap is the whole method: a post-mortem that
 * blames every move explains nothing, so you are forced to pick the moves that
 * actually decided the game.
 */
export const MAX_REVIEW_MISTAKES = 3

export interface TagGroup {
  name: string
  /** Why this group of causes is one group, shown as the column's hint. */
  hint: string
  tags: string[]
}

/**
 * The shared vocabulary. Free tags are allowed — anything already used in a review is
 * offered back as a suggestion — but a fixed list is what makes the counts comparable
 * across months, which is the entire reason for keeping them.
 */
export const TAG_GROUPS: TagGroup[] = [
  {
    name: 'Tactics',
    hint: 'A motif you missed or allowed',
    tags: [
      'hanging piece',
      'fork',
      'pin',
      'skewer',
      'discovered attack',
      'back rank',
      'removing the defender',
      'overloaded defender',
      'trapped piece',
      'mate threat',
      'in-between move',
    ],
  },
  {
    name: 'Calculation',
    hint: 'The search itself broke down',
    tags: [
      "missed opponent's reply",
      'stopped calculating too early',
      'skipped checks and captures',
      'miscounted material',
      'lost track of the position',
    ],
  },
  {
    name: 'Strategy',
    hint: 'The move fit no sound plan',
    tags: [
      'wrong plan',
      'weakened my king',
      'pawn structure',
      'conceded a square',
      'wrong piece traded',
      'misplaced piece',
      'premature pawn push',
      'opened the position badly',
      "ignored opponent's plan",
    ],
  },
  {
    name: 'Endgame',
    hint: 'Technique once the pieces thinned out',
    tags: ['king activity', 'pawn race', 'conversion technique', 'wrong trade into the endgame'],
  },
  {
    name: 'Opening',
    hint: 'Left the line you know',
    tags: ['out of book', 'forgot the theory', 'wrong move order'],
  },
  {
    name: 'Mindset',
    hint: 'Nothing to do with the position',
    tags: [
      'played too fast',
      'time pressure',
      'autopilot move',
      'impatient',
      'overconfident while winning',
      'panicked while worse',
      'rattled by a surprise',
    ],
  },
]

const GROUP_BY_TAG = new Map<string, string>(
  TAG_GROUPS.flatMap(group => group.tags.map(tag => [tag, group.name] as const)),
)

/** Which group a tag belongs to; tags you invented land in "Your own". */
export function tagGroup(tag: string): string {
  return GROUP_BY_TAG.get(tag) ?? 'Your own'
}

/**
 * The proposed moves of an entry, whichever shape they were stored in. Reviews written
 * before a move could carry its reasoning hold plain SAN strings, and Firestore keeps
 * what it was given — so the old shape is converted on read rather than migrated, the
 * same way pre-game ratings and the variation tree are derived rather than stored.
 */
export function betterMovesOf(mistake: ReviewedMistake): ProposedMove[] {
  return (mistake.betterMoves ?? []).map(move =>
    typeof move === 'string' ? { san: move, why: '' } : move,
  )
}

/**
 * A game counts as reviewed once you have written something about it — entries, or
 * just a note. A game where nothing went wrong still deserves to be marked as looked
 * at, otherwise it keeps coming back as unfinished business.
 */
export function hasReview(game: GameRecord): boolean {
  const review = game.review
  if (!review) return false
  return review.mistakes.length > 0 || review.notes.trim().length > 0
}

/**
 * The entries that describe a trainable pattern. A move marked unreasonable is left
 * out: the engine's objection stands, but there is nothing to practise, and counting
 * it would inflate whatever tag happens to sit on it.
 */
export function trainableMistakes(review: GameReview | undefined): ReviewedMistake[] {
  return (review?.mistakes ?? []).filter(mistake => !mistake.unreasonable)
}

/** Tags a game contributes to the pattern counts, de-duplicated within the game. */
export function tagsOf(game: GameRecord): string[] {
  const tags = new Set<string>()
  for (const mistake of trainableMistakes(game.review)) {
    for (const tag of mistake.tags) tags.add(tag)
  }
  return [...tags]
}

/** Every tag ever written, for suggesting your own additions back to you. */
export function knownTags(games: GameRecord[]): string[] {
  const tags = new Set<string>()
  for (const game of games) {
    for (const mistake of game.review?.mistakes ?? []) {
      for (const tag of mistake.tags) {
        if (!GROUP_BY_TAG.has(tag)) tags.add(tag)
      }
    }
  }
  return [...tags].sort()
}

export interface TagTally {
  tag: string
  group: string
  /** How many entries carry this tag. */
  count: number
  /** How many games — a tag twice in one game is one game. */
  games: number
  /** Results of the games carrying it, so a frequent tag that costs nothing shows up. */
  losses: number
}

/** The mistake database: which ideas keep appearing, worst first. */
export function aggregateTags(games: GameRecord[]): TagTally[] {
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
      group: tagGroup(tag),
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

export function isFault(tag: string): boolean {
  return FAULT_TAGS.includes(tag)
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
