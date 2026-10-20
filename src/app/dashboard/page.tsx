'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAnalysisQueue } from '@/components/AnalyseButton'
import GameRow from '@/components/GameRow'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import ClockPanel from '@/components/ClockPanel'
import RatingPanel from '@/components/RatingPanel'
import Panel from '@/components/Section'
import FilterPanel from '@/components/FilterPanel'
import StatBlockCard from '@/components/StatBlockCard'
import ShapePanel from '@/components/ShapePanel'
import SyncPanel from '@/components/SyncPanel'
import ThinkPanel from '@/components/ThinkPanel'
import VariationTable, { type VariationRow } from '@/components/VariationTable'
import { onAnalysed, stopAll } from '@/lib/analysis-queue'
import { getGames, getOpenings, getProfile, getRatingHistory } from '@/lib/firestore'
import { sinceTimestamp } from '@/lib/game-filters'
import type { RatingHistory } from '@/lib/rating-history'
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
  UNCLASSIFIED_OPENING,
  readFilters,
  writeFilters,
  type Filters,
} from '@/lib/dashboard-filters'
import { computeClockStats, computePhases, timeControlsIn } from '@/lib/clocks'
import { computeSplit, computeStats } from '@/lib/stats'
import type {
  GameRecord,
  OpeningLine,
  UserProfile,
} from '@/types/chess'

/** Built once: the names are a table, not a reading of the games. */
const PAGE_SIZE = 50

/**
 * `both` means both sites you play on. Uploaded games are a separate question — they are
 * games you brought in to study, not your record — so they only appear when asked for.
 */




/** Blunders per analysed game, or null when none of them have been analysed. */
function blunderRate(games: GameRecord[]): number | null {
  const analysed = games.filter(game => game.analysis)
  if (analysed.length === 0) return null

  const blunders = analysed.reduce((sum, game) => sum + (game.analysis?.blunders ?? 0), 0)
  return Math.round((blunders / analysed.length) * 100) / 100
}

function DashboardBody({ userId }: { userId: string }) {
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [history, setHistory] = useState<RatingHistory>({})
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => readFilters(searchParams))
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const { opening, endedIn, shape } = filters

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
      Promise.all([
        getGames(userId, options),
        getOpenings(userId, options),
        getRatingHistory(userId, options),
        // the sync panel lives here now, and it needs to know which accounts are linked
        getProfile(userId, options),
      ])
        .then(([loadedGames, loadedOpenings, loadedHistory, loadedProfile]) => {
          setGames(loadedGames)
          setOpenings(loadedOpenings)
          setHistory(loadedHistory)
          setProfile(loadedProfile)
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

  /**
   * Games the queue finishes land in the list without a reload.
   *
   * The queue hands over the analysis and the game id rather than a whole record,
   * because the record it was holding is minutes old by then — long enough for a review
   * to have been written on it. Merging onto the current one is this page's job, the
   * same as every other edit here.
   */
  useEffect(
    () =>
      onAnalysed(({ gameId, analysis, annotatedPgn }) =>
        setGames(prev =>
          (prev ?? []).map(game =>
            game.id === gameId ? { ...game, analysis, annotatedPgn } : game,
          ),
        ),
      ),
    [],
  )

  const queue = useAnalysisQueue()
  /** Everything the queue still has to do, the game in progress included. */
  const queueSize = (queue.active ? 1 : 0) + queue.waiting.length

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

  /**
   * Sync sits at the top of the dashboard, folded, because this is the page you are on
   * when you notice games are missing. It opens itself when there are none at all — then
   * it is the only thing on the page worth doing.
   */
  const sync = profile && (
    <SyncPanel
      userId={userId}
      profile={profile}
      startFolded={games.length > 0}
      onSynced={() => load()}
    />
  )

  if (games.length === 0) {
    return (
      <>
        {sync}
        <p className="py-12 text-center text-zinc-500">No games stored yet.</p>
      </>
    )
  }

  const up = current
    ? {
        label: parent ? openingLabel(parent.opening) : 'All games',
        onSelect: () => patch({ opening: parent ? parent.opening.id : ALL_OPENINGS }),
      }
    : undefined

  return (
    <>
      {sync}

      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        patch={patch}
        games={games ?? []}
        scoped={scoped}
        allNodes={allNodes}
        openings={openings}
        availableControls={availableControls}
        path={path}
        refresh={refresh}
        refreshing={refreshing}
      />

      {/*
        The slice travels with the link: "what went wrong in these games" is the same
        question asked of the same set, so arriving there with the filters cleared would
        mean setting them twice.
      */}
      <Link
        href={`/mistakes${search}`}
        className="flex items-center justify-between gap-3 px-5 py-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
      >
        <span className="text-sm text-zinc-200">
          What went wrong
          <span className="text-zinc-600"> · the engine&rsquo;s marks, your tags, and where they land</span>
        </span>
        <span className="text-xs text-zinc-500 shrink-0">Mistakes →</span>
      </Link>

      <Panel id="results" title="Results">
        <div className="grid gap-3 md:grid-cols-3">
          <StatBlockCard label="Overall" stats={split.overall} />
          <StatBlockCard label="As White" stats={split.white} />
          <StatBlockCard label="As Black" stats={split.black} />
        </div>
      </Panel>

      <ClockPanel stats={clock} totalGames={scoped.length} />

      <RatingPanel
        history={history}
        from={sinceTimestamp(filters.since)}
        source={filters.source}
      />

      <ShapePanel
        games={scoped}
        active={shape}
        onPick={value => patch({ shape: value })}
      />

      <ThinkPanel
        phases={phases}
        endedIn={endedIn}
        onPickPhase={label => patch({ endedIn: endedIn === label ? null : label })}
      />

      {breakdown.length > 0 ? (
        <VariationTable
          title={current ? `Sub-variations of ${openingLabel(current.opening)}` : 'By opening'}
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

      <Panel
        id="games"
        title="Games"
        meta={`${scoped.length}`}
        actions={
          queueSize > 0 ? (
            <span className="flex items-center gap-2 text-xs text-zinc-500">
              <Spinner size="w-3 h-3" />
              analysing {queueSize} game{queueSize === 1 ? '' : 's'}
              <button
                onClick={stopAll}
                title="Empty the queue and stop the game being analysed"
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Stop all
              </button>
            </span>
          ) : undefined
        }
      >
        {scoped.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">No games match these filters.</div>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
              {scoped.slice(0, limit).map(game => (
                <GameRow
                  key={game.id}
                  userId={userId}
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
      </Panel>
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
