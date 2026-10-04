'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Chip from '@/components/Chip'
import GameRow from '@/components/GameRow'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import ClockPanel from '@/components/ClockPanel'
import ReviewPanel from '@/components/ReviewPanel'
import StatBlockCard from '@/components/StatBlockCard'
import ThinkPanel from '@/components/ThinkPanel'
import VariationTable, { type VariationRow } from '@/components/VariationTable'
import { getGames, getOpenings } from '@/lib/firestore'
import {
  buildOpeningTree,
  findPath,
  flattenTree,
  formatMoves,
  gameMatchesNode,
  matchingPath,
  openingLabel,
} from '@/lib/opening'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import {
  ALL_OPENINGS,
  DEFAULT_FILTERS,
  UNCLASSIFIED_OPENING,
  readFilters,
  writeFilters,
  type Filters,
} from '@/lib/dashboard-filters'
import { SINCE_OPTIONS } from '@/lib/game-filters'
import { GAME_PHASES, computeClockStats, computePhases, timeControlsIn } from '@/lib/clocks'
import { computeSplit, computeStats } from '@/lib/stats'
import { SOURCE_LABEL } from '@/types/chess'
import type { Color, GameRecord, OpeningLine, Source } from '@/types/chess'

const PAGE_SIZE = 50

const SOURCE_OPTIONS: { value: Source | 'both'; label: string }[] = [
  { value: 'both', label: 'both' },
  { value: 'chesscom', label: SOURCE_LABEL.chesscom },
  { value: 'lichess', label: SOURCE_LABEL.lichess },
]

const REVIEW_OPTIONS: { value: Filters['reviewed']; label: string; title: string }[] = [
  { value: null, label: 'any', title: 'Reviewed or not' },
  { value: 'yes', label: 'reviewed', title: 'Games you have taken apart' },
  { value: 'no', label: 'not reviewed', title: 'Games still waiting' },
]

const COLOR_OPTIONS: { value: Color | 'both'; label: string }[] = [
  { value: 'both', label: 'both' },
  { value: 'white', label: 'as White' },
  { value: 'black', label: 'as Black' },
]

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs uppercase tracking-wide text-zinc-500 sm:pt-2">{children}</span>
  )
}

/** Blunders per analysed game, or null when none of them have been analysed. */
function blunderRate(games: GameRecord[]): number | null {
  const analysed = games.filter(game => game.analysis)
  if (analysed.length === 0) return null

  const blunders = analysed.reduce((sum, game) => sum + (game.analysis?.blunders ?? 0), 0)
  return Math.round((blunders / analysed.length) * 100) / 100
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

function DashboardBody({ userId }: { userId: string }) {
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => readFilters(searchParams))
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const {
    opening,
    timeControls,
    since,
    minRating,
    maxRating,
    color,
    source,
    endedIn,
    mistakes,
    reviewed,
    tag,
  } = filters

  /** Mirror the filters into the address bar so a reload — or a shared link — restores the view. */
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname + writeFilters(filters))
  }, [filters])

  const patch = useCallback((changes: Partial<Filters>) => {
    setFilters(prev => ({ ...prev, ...changes }))
    setLimit(PAGE_SIZE)
  }, [])

  /** State only moves in the callbacks: setting it synchronously here would cascade. */
  const load = useCallback(
    (options?: { fresh: true }) =>
      Promise.all([getGames(userId, options), getOpenings(userId, options)])
        .then(([loadedGames, loadedOpenings]) => {
          setGames(loadedGames)
          setOpenings(loadedOpenings)
          setLoadError(null)
        })
        .catch(caught => {
          setLoadError(errorText(caught, 'Could not load your games from Firestore.'))
        }),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  /** Reads come from the local cache; this bills a server read to pick up other devices. */
  async function refresh() {
    setRefreshing(true)
    try {
      await load({ fresh: true })
    } finally {
      setRefreshing(false)
    }
  }

  /** Every position each game passed through, so switching variations is instant. */
  const positionKeys = useMemo(() => positionKeyMap(games ?? []), [games])

  /** Only offer controls the user has actually played. */
  const availableControls = useMemo(() => timeControlsIn(games ?? []), [games])

  const tree = useMemo(() => buildOpeningTree(openings), [openings])
  const allNodes = useMemo(() => flattenTree(tree), [tree])
  const unclassifiedView = opening === UNCLASSIFIED_OPENING
  const path = useMemo(
    () =>
      opening === ALL_OPENINGS || opening === UNCLASSIFIED_OPENING
        ? []
        : findPath(tree, opening),
    [tree, opening],
  )
  const current = path.length > 0 ? path[path.length - 1] : null
  const parent = path.length > 1 ? path[path.length - 2] : null

  /**
   * Every game passing the filters and the selected variation. `scopeGames` is shared
   * with the game view, so walking from a game back to this list cannot drift.
   */
  const scoped = useMemo(
    () => scopeGames(games ?? [], tree, positionKeys, filters),
    [games, tree, positionKeys, filters],
  )

  /** The game view, carrying the filters so its Back link restores this exact slice. */
  const search = useMemo(() => writeFilters(filters), [filters])
  const hrefFor = useCallback(
    (game: GameRecord) => `/games/${game.id}${search}`,
    [search],
  )

  const split = useMemo(() => computeSplit(scoped), [scoped])
  const clock = useMemo(() => computeClockStats(scoped), [scoped])
  const phases = useMemo(() => computePhases(scoped), [scoped])

  /** Which of the saved lines each visible game followed, computed only for the rendered slice. */
  const linesByGame = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const game of scoped.slice(0, limit)) {
      const nodes = matchingPath(tree, game, positionKeys.get(game.id) ?? new Set())
      if (nodes.length > 0) map.set(game.id, nodes.map(node => node.opening.name))
    }
    return map
  }, [scoped, limit, tree, positionKeys])

  /** One row per sub-variation of the current selection, or per top-level opening. */
  const breakdown = useMemo(() => {
    if (unclassifiedView) return []

    const children = current ? current.children : tree
    if (children.length === 0) return []

    const claimed = new Set<string>()
    const rows: VariationRow[] = children.map(node => {
      const matching = scoped.filter(game =>
        gameMatchesNode(game, positionKeys.get(game.id) ?? new Set(), node),
      )
      for (const game of matching) claimed.add(game.id)
      const matchingClock = computeClockStats(matching)

      return {
        key: node.opening.id,
        name: openingLabel(node.opening),
        note: formatMoves(node.opening.moves),
        stats: computeStats(matching),
        think: matchingClock.medianPerMove,
        blundersPerGame: blunderRate(matching),
        onSelect: () => patch({ opening: node.opening.id }),
      }
    })

    rows.sort((a, b) => b.stats.total - a.stats.total)

    const rest = scoped.filter(game => !claimed.has(game.id))
    if (rest.length > 0) {
      const restClock = computeClockStats(rest)
      rows.push({
        key: 'unclassified',
        name: current ? 'Other lines' : 'Not in a saved opening',
        note: current
          ? 'Reached ' + openingLabel(current.opening) + ' but no saved sub-variation'
          : undefined,
        stats: computeStats(rest),
        think: restClock.medianPerMove,
        blundersPerGame: blunderRate(rest),
        onSelect: current ? undefined : () => patch({ opening: UNCLASSIFIED_OPENING }),
      })
    }

    return rows
  }, [scoped, current, tree, positionKeys, patch, unclassifiedView])

  if (loadError) {
    return (
      <LoadError
        message={loadError}
        onRetry={() => {
          setLoadError(null)
          load({ fresh: true })
        }}
      />
    )
  }

  if (games === null) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="py-16 text-center text-zinc-500">
        No games stored yet — link an account and sync from{' '}
        <Link href="/profile" className="underline text-zinc-200">
          Profile &amp; Sync
        </Link>
        .
      </div>
    )
  }

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)

  const up = current
    ? {
        label: parent ? openingLabel(parent.opening) : 'All games',
        onSelect: () => patch({ opening: parent ? parent.opening.id : ALL_OPENINGS }),
      }
    : undefined

  return (
    <>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Filters</h2>
          <div className="flex items-center gap-3">
            {isFiltered && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Reset
              </button>
            )}
            <button
              onClick={refresh}
              disabled={refreshing}
              title="Games load from a local cache — this re-reads them from Firestore"
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-[6rem_1fr] gap-x-4 gap-y-3 items-start">
          <FilterLabel>Opening</FilterLabel>
          <div className="flex flex-col gap-1.5 min-w-0">
            <select
              value={opening}
              onChange={event => patch({ opening: event.target.value })}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-600"
            >
              <option value={ALL_OPENINGS}>All games</option>
              {allNodes.map(node => (
                <option key={node.opening.id} value={node.opening.id}>
                  {'— '.repeat(node.depth)}
                  {openingLabel(node.opening)}
                </option>
              ))}
              <option value={UNCLASSIFIED_OPENING}>Not in a saved opening</option>
            </select>

            {unclassifiedView && (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => patch({ opening: ALL_OPENINGS })}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  All games
                </button>
                <span className="text-zinc-700">›</span>
                <span className="text-zinc-200">Not in a saved opening</span>
              </div>
            )}

            {path.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <button
                  onClick={() => patch({ opening: ALL_OPENINGS })}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  All games
                </button>
                {path.map((node, index) => (
                  <span key={node.opening.id} className="flex items-center gap-1.5">
                    <span className="text-zinc-700">›</span>
                    <button
                      onClick={() => patch({ opening: node.opening.id })}
                      className={
                        index === path.length - 1
                          ? 'text-zinc-200'
                          : 'text-zinc-400 hover:text-zinc-100 transition-colors'
                      }
                    >
                      {openingLabel(node.opening)}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <FilterLabel>Site</FilterLabel>
          <div className="flex gap-1.5 flex-wrap">
            {SOURCE_OPTIONS.map(option => (
              <Chip
                key={option.value}
                active={source === option.value}
                onClick={() => patch({ source: option.value })}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          <FilterLabel>Control</FilterLabel>
          <div className="flex gap-1.5 flex-wrap">
            <Chip active={timeControls.length === 0} onClick={() => patch({ timeControls: [] })}>
              any
            </Chip>
            {availableControls.map(control => (
              <Chip
                key={control.key}
                active={timeControls.includes(control.key)}
                onClick={() => patch({ timeControls: toggle(timeControls, control.key) })}
                title={`${control.games} game${control.games === 1 ? '' : 's'}`}
              >
                {control.label}
              </Chip>
            ))}
          </div>

          <FilterLabel>Ended in</FilterLabel>
          <select
            value={endedIn ?? ''}
            onChange={event => patch({ endedIn: event.target.value || null })}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-600 sm:max-w-xs"
          >
            <option value="">Any phase</option>
            {GAME_PHASES.map(phase => (
              <option key={phase.label} value={phase.label}>
                {phase.name} (moves {phase.label})
              </option>
            ))}
          </select>

          <FilterLabel>Engine</FilterLabel>
          <select
            value={mistakes ?? ''}
            onChange={event =>
              patch({ mistakes: (event.target.value || null) as Filters['mistakes'] })
            }
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-600 sm:max-w-xs"
          >
            <option value="">Any game</option>
            <option value="analysed">Analysed</option>
            <option value="unanalysed">Not analysed yet</option>
            <option value="blunder">Contains a blunder</option>
            <option value="mistake">Contains a mistake</option>
            <option value="clean">No blunder or mistake</option>
          </select>

          <FilterLabel>Review</FilterLabel>
          <div className="flex gap-1.5 flex-wrap items-center">
            {REVIEW_OPTIONS.map(option => (
              <Chip
                key={option.label}
                active={reviewed === option.value}
                onClick={() => patch({ reviewed: option.value })}
                title={option.title}
              >
                {option.label}
              </Chip>
            ))}
            {tag && (
              <button
                onClick={() => patch({ tag: null })}
                title="Clear the tag filter"
                className="px-3 py-1 text-xs rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 transition-colors"
              >
                {tag} ✕
              </button>
            )}
          </div>

          <FilterLabel>Colour</FilterLabel>
          <div className="flex gap-1.5 flex-wrap">
            {COLOR_OPTIONS.map(option => (
              <Chip
                key={option.value}
                active={color === option.value}
                onClick={() => patch({ color: option.value })}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          <FilterLabel>Period</FilterLabel>
          <div className="flex gap-1.5 flex-wrap">
            {SINCE_OPTIONS.map(option => (
              <Chip
                key={option.value}
                active={since === option.value}
                onClick={() => patch({ since: option.value })}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          <FilterLabel>My rating</FilterLabel>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <input
              type="number"
              inputMode="numeric"
              value={minRating ?? ''}
              onChange={event =>
                patch({ minRating: event.target.value ? Number(event.target.value) : null })
              }
              placeholder="any"
              className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-600"
            />
            <span>to</span>
            <input
              type="number"
              inputMode="numeric"
              value={maxRating ?? ''}
              onChange={event =>
                patch({ maxRating: event.target.value ? Number(event.target.value) : null })
              }
              placeholder="any"
              className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-600"
            />
          </div>
        </div>
      </section>

      <p className="text-xs text-zinc-500 -mt-3">
        {current
          ? `${scoped.length} of ${games.length} games reached ${openingLabel(current.opening)} or one of its sub-variations.`
          : unclassifiedView
            ? `${scoped.length} of ${games.length} games reached none of your saved openings.`
            : `${scoped.length} of ${games.length} games in scope.`}
        {openings.length === 0 && (
          <>
            {' '}
            <Link href="/openings" className="underline text-zinc-300">
              Save an opening
            </Link>{' '}
            to break these numbers down by line.
          </>
        )}
      </p>

      <section className="grid gap-3 md:grid-cols-3">
        <StatBlockCard label="Overall" stats={split.overall} />
        <StatBlockCard label="As White" stats={split.white} />
        <StatBlockCard label="As Black" stats={split.black} />
      </section>

      <ClockPanel stats={clock} totalGames={scoped.length} />

      <ReviewPanel
        games={scoped}
        activeTag={tag}
        onPickTag={value => patch({ tag: value })}
        hrefFor={hrefFor}
        drillHref={`/learn${search}`}
      />

      <ThinkPanel
        phases={phases}
        endedIn={endedIn}
        onPickPhase={label => patch({ endedIn: endedIn === label ? null : label })}
      />

      {breakdown.length > 0 ? (
        <VariationTable
          title={current ? `Sub-variations of ${openingLabel(current.opening)}` : 'By opening'}
          caption={
            current
              ? 'Each row counts the games that reached that sub-variation. Click one to drill in.'
              : 'Each row counts the games that reached that opening, sub-variations included.'
          }
          rows={breakdown}
          up={up}
        />
      ) : (
        current &&
        up && (
          <div className="flex flex-col gap-2">
            <button
              onClick={up.onSelect}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100 transition-colors self-start"
            >
              <span aria-hidden="true">↑</span>
              Back to {up.label}
            </button>
            <p className="text-xs text-zinc-600">
              No sub-variations saved under {openingLabel(current.opening)} yet —{' '}
              <Link href="/openings" className="underline text-zinc-400">
                add a longer line
              </Link>{' '}
              and it will nest here.
            </p>
          </div>
        )
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-sm">Games ({scoped.length})</h2>
        </div>

        {scoped.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">No games match these filters.</div>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
              {scoped.slice(0, limit).map(game => (
                <GameRow
                  key={game.id}
                  game={game}
                  line={linesByGame.get(game.id) ?? []}
                  href={hrefFor(game)}
                />
              ))}
            </div>
            {scoped.length > limit && (
              <button
                onClick={() => setLimit(prev => prev + PAGE_SIZE)}
                className="self-center text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Show more ({scoped.length - limit} left)
              </button>
            )}
          </>
        )}
      </section>
    </>
  )
}

export default function DashboardPage() {
  return (
    <PageShell title="Dashboard" wide>
      {user => (
        <Suspense
          fallback={
            <div className="py-16 flex justify-center">
              <Spinner size="w-6 h-6" />
            </div>
          }
        >
          <DashboardBody userId={user.uid} />
        </Suspense>
      )}
    </PageShell>
  )
}
