import {
  buildOpeningTree,
  flattenTree,
  gameMatchesNode,
  gamePositionKeys,
  openingRoute,
  routeSteps,
  routeText,
  type GameKeys,
} from './opening'
import { computeSplit, computeStats, type StatBlock, type StatSplit } from './stats'
import { actualScore, expectedScore, withRatingsBefore } from './ratings'
import {
  clockUsage,
  computeClockStats,
  computePhases,
  type ClockStats,
  type PhaseBucket,
} from './clocks'
import { endingOf, type Ending } from './termination'
import {
  aggregateTags,
  reviewSummary,
  tagsOf,
  type ReviewSummary,
  type TagTally,
} from './review'
import { TIME_CLASSES } from '@/types/chess'
import type {
  Color,
  GameRecord,
  GameReview,
  StoredAnalysis,
  OpeningColor,
  OpeningLine,
  TimeClass,
  UserProfile,
} from '@/types/chess'

/** How many opening moves to quote for a line the user has not saved yet. */
const SAMPLE_PLY = 12

export interface VariationExport {
  id: string
  name: string
  /** Root first, e.g. ["Caro-Kann", "Exchange Variation", "Panov Attack"]. */
  path: string[]
  depth: number
  color: OpeningColor
  ply: number
  moves: string[]
  /** Covers this line and every sub-variation below it. */
  stats: StatSplit
}

export interface UnsavedOpening {
  opening: string
  eco: string | null
  color: Color
  stats: StatBlock
  /** Opening moves of one of these games, ready to paste in as a new line. */
  sampleLine: string
  sampleUrl: string
}

export interface OpponentStrengthBand {
  label: string
  games: number
  /** Your score in these games. */
  actual: number
  /** What the rating difference predicted. */
  expected: number
  /** actual - expected, in percentage points. */
  delta: number
}

export interface CompactGame {
  id: string
  playedAt: string
  source: string
  url: string
  timeClass: TimeClass
  timeControl: string
  color: Color
  result: string
  /** The provider's own word for how the game ended. */
  termination: string
  /** That word normalized across providers — see lib/termination.ts. */
  endedBy: Ending
  opponent: string
  opponentRating: number | null
  userRating: number | null
  /** Ratings going into the game — see lib/ratings.ts, the stored ones are post-game. */
  ratingBefore: number | null
  opponentRatingBefore: number | null
  ratingDiff: number | null
  eco: string | null
  openingName: string | null
  /**
   * The saved lines this game reached, in the order it reached them. Empty when it
   * matched none. Only lines the game actually stood in — a parent it never played
   * through is no longer named for it.
   */
  line: string[]
  /**
   * The same route written out, with `→` where the game transposed in rather than
   * playing that line's own move order: `Queen's Gambit Declined → Panov Attack`.
   */
  route: string
  /** Seconds left on your clock at the end, null without clock data. */
  timeLeft: number | null
  /** Median seconds you spent per move. */
  medianPerMove: number | null
  slowestMove: number | null
  /** Share of your time spent on the first ten moves. */
  openingShare: number | null
  /** Engine findings, once the game has been analysed. */
  analysisDepth: number | null
  blunders: number | null
  mistakes: number | null
  inaccuracies: number | null
  /** Your own moves with their evaluations. Only with `moves=1`. */
  analysisMoves?: StoredAnalysis['moves']
  /** Tags from your review that count as trainable patterns. */
  reviewTags: string[]
  /** Your own root-cause analysis, present only on games you have reviewed. */
  review?: GameReview
  moves?: string[]
  /** Seconds left after each ply, index-aligned with `moves`. Only with `moves=1`. */
  clocks?: number[] | null
}

export interface ExportPayload {
  generatedAt: string
  profile: UserProfile
  /**
   * `patterns` is the old name for `openings` and carries the same number. The saved
   * opening lines were called patterns until the word was needed for the thematic
   * patterns, and a field that something out there may already read is not worth
   * breaking over a rename.
   */
  counts: { games: number; openings: number; patterns: number }
  totals: StatSplit
  byTimeClass: Partial<Record<TimeClass, StatBlock>>
  variations: VariationExport[]
  unclassified: StatBlock
  unsavedOpenings: UnsavedOpening[]
  /** Performance against the rating difference, using reconstructed pre-game ratings. */
  byOpponentStrength: OpponentStrengthBand[]
  /** Timeout rate and time-usage medians for the slice. */
  clock: ClockStats
  /** How your losses ended, using the normalized vocabulary. */
  lossesBy: Partial<Record<Ending, number>>
  /** Thinking time by phase of the game, and where the slowest think lands. */
  phases: PhaseBucket[]
  /** Your own reviews: how much has been taken apart, and which patterns recur. */
  reviews: { summary: ReviewSummary; tags: TagTally[] }
  games?: CompactGame[]
}

export interface ExportOptions {
  includeGames: boolean
  includeMoves: boolean
  gameLimit: number
}

function formatLine(moves: string[]): string {
  return moves
    .slice(0, SAMPLE_PLY)
    .map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san))
    .join(' ')
}

/**
 * Everything the dashboard derives, in one JSON document: per-line results, the
 * openings that fall outside every saved line, and optionally the games themselves.
 */
const STRENGTH_BANDS: { label: string; min: number; max: number }[] = [
  { label: 'much weaker (under -100)', min: -Infinity, max: -100 },
  { label: 'weaker (-100 to -25)', min: -100, max: -25 },
  { label: 'even (within 25)', min: -25, max: 25 },
  { label: 'stronger (+25 to +100)', min: 25, max: 100 },
  { label: 'much stronger (over +100)', min: 100, max: Infinity },
]

function round(value: number): number {
  return Math.round(value * 1000) / 10
}

export function buildExport(
  profile: UserProfile,
  games: GameRecord[],
  openings: OpeningLine[],
  options: ExportOptions,
): ExportPayload {
  const counted = withRatingsBefore(games)
  const keys = new Map(counted.map(game => [game.id, gamePositionKeys(game.moves)]))
  const keysFor = (game: GameRecord): GameKeys => keys.get(game.id) ?? new Map()

  const tree = buildOpeningTree(openings)
  const nodes = flattenTree(tree)

  const routesById = new Map<string, { line: string[]; route: string }>()
  for (const game of counted) {
    const steps = routeSteps(openingRoute(tree, game, keysFor(game)), opening => opening.name)
    routesById.set(game.id, { line: steps.map(step => step.name), route: routeText(steps) })
  }

  const variations: VariationExport[] = nodes.map(node => {
    // membership by position, not by name: two repertoires can share a name
    const matching = counted.filter(game => gameMatchesNode(game, keysFor(game), node))

    return {
      id: node.opening.id,
      name: node.opening.name,
      path: [],
      depth: node.depth,
      color: node.opening.color,
      ply: node.opening.ply,
      moves: node.opening.moves,
      stats: computeSplit(matching),
    }
  })

  // fill in each variation's ancestry from the flattened depth-first order
  const trail: string[] = []
  nodes.forEach((node, index) => {
    trail.length = node.depth
    trail.push(node.opening.name)
    variations[index].path = [...trail]
  })

  const unmatched = counted.filter(game => (routesById.get(game.id)?.line ?? []).length === 0)

  const grouped = new Map<string, GameRecord[]>()
  for (const game of unmatched) {
    const label = game.openingName ?? game.eco ?? 'Unknown opening'
    const key = `${game.color}|${label}`
    const bucket = grouped.get(key)
    if (bucket) bucket.push(game)
    else grouped.set(key, [game])
  }

  const unsavedOpenings: UnsavedOpening[] = [...grouped.values()]
    .map(bucket => {
      const sample = bucket[0]
      return {
        opening: sample.openingName ?? sample.eco ?? 'Unknown opening',
        eco: sample.eco,
        color: sample.color,
        stats: computeStats(bucket),
        sampleLine: formatLine(sample.moves),
        sampleUrl: sample.url,
      }
    })
    .sort((a, b) => b.stats.total - a.stats.total)

  const comparable = counted.filter(game => game.ratingDiff !== null)
  const byOpponentStrength: OpponentStrengthBand[] = STRENGTH_BANDS.map(band => {
    const inBand = comparable.filter(
      game => (game.ratingDiff as number) >= band.min && (game.ratingDiff as number) < band.max,
    )
    if (inBand.length === 0) {
      return {
        label: band.label,
        games: 0,
        actual: 0,
        expected: 0,
        delta: 0,
      }
    }

    const actual = inBand.reduce((sum, game) => sum + actualScore(game), 0) / inBand.length
    const expected =
      inBand.reduce((sum, game) => sum + expectedScore(game.ratingDiff as number), 0) /
      inBand.length

    return {
      label: band.label,
      games: inBand.length,
      actual: round(actual),
      expected: round(expected),
      delta: round(actual - expected),
    }
  })

  const byTimeClass: Partial<Record<TimeClass, StatBlock>> = {}
  for (const timeClass of TIME_CLASSES) {
    const slice = counted.filter(game => game.timeClass === timeClass)
    if (slice.length > 0) byTimeClass[timeClass] = computeStats(slice)
  }

  const payload: ExportPayload = {
    generatedAt: new Date().toISOString(),
    profile,
    counts: { games: games.length, openings: openings.length, patterns: openings.length },
    totals: computeSplit(counted),
    byTimeClass,
    variations,
    unclassified: computeStats(unmatched),
    unsavedOpenings,
    byOpponentStrength,
    clock: computeClockStats(counted),
    phases: computePhases(counted),
    reviews: { summary: reviewSummary(counted), tags: aggregateTags(counted) },
    lossesBy: counted
      .filter(game => game.result === 'loss')
      .reduce<Partial<Record<Ending, number>>>((tally, game) => {
        const ending = endingOf(game)
        tally[ending] = (tally[ending] ?? 0) + 1
        return tally
      }, {}),
  }

  if (options.includeGames) {
    payload.games = counted.slice(0, options.gameLimit).map(game => {
      const clock = clockUsage(game)
      return {
        id: game.id,
        playedAt: new Date(game.playedAt).toISOString(),
        source: game.source,
        url: game.url,
        timeClass: game.timeClass,
        timeControl: game.timeControl,
        color: game.color,
        result: game.result,
        termination: game.termination,
        endedBy: endingOf(game),
        opponent: game.opponent,
        opponentRating: game.opponentRating,
        userRating: game.userRating,
        ratingBefore: game.ratingBefore,
        opponentRatingBefore: game.opponentRatingBefore,
        ratingDiff: game.ratingDiff,
        eco: game.eco,
        openingName: game.openingName,
        line: routesById.get(game.id)?.line ?? [],
        route: routesById.get(game.id)?.route ?? '',
        timeLeft: clock?.timeLeft ?? null,
        medianPerMove: clock?.medianPerMove ?? null,
        slowestMove: clock?.slowestMove ?? null,
        openingShare: clock?.openingShare ?? null,
        analysisDepth: game.analysis?.depth ?? null,
        blunders: game.analysis?.blunders ?? null,
        mistakes: game.analysis?.mistakes ?? null,
        inaccuracies: game.analysis?.inaccuracies ?? null,
        reviewTags: tagsOf(game),
        ...(game.review ? { review: game.review } : {}),
        ...(options.includeMoves && game.analysis
          ? { analysisMoves: game.analysis.moves }
          : {}),
        ...(options.includeMoves ? { moves: game.moves, clocks: game.clocks } : {}),
      }
    })
  }

  return payload
}
