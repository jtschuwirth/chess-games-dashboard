'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Chip from '@/components/Chip'
import GameRow from '@/components/GameRow'
import PageShell, { Spinner } from '@/components/PageShell'
import ClockPanel from '@/components/ClockPanel'
import StatBlockCard from '@/components/StatBlockCard'
import ThinkPanel from '@/components/ThinkPanel'
import VariationTable, { type VariationRow } from '@/components/VariationTable'
import { getGames, getPatterns } from '@/lib/firestore'
import {
  buildPatternTree,
  findPath,
  flattenTree,
  formatMoves,
  gameMatchesNode,
  gamePositionKeys,
  matchingPath,
  patternLabel,
} from '@/lib/pattern'
import {
  ALL_OPENINGS,
  DEFAULT_FILTERS,
  readFilters,
  writeFilters,
  type Filters,
} from '@/lib/dashboard-filters'
import { SINCE_OPTIONS, matchesCriteria } from '@/lib/game-filters'
import { computeClockStats, computePhases } from '@/lib/clocks'
import { computeSplit, computeStats } from '@/lib/stats'
import { SOURCE_LABEL, TIME_CLASSES } from '@/types/chess'
import type { Color, GameRecord, PatternRecord, Source } from '@/types/chess'

const PAGE_SIZE = 50

const SOURCE_OPTIONS: { value: Source | 'both'; label: string }[] = [
  { value: 'both', label: 'both' },
  { value: 'chesscom', label: SOURCE_LABEL.chesscom },
  { value: 'lichess', label: SOURCE_LABEL.lichess },
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

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

function DashboardBody({ userId }: { userId: string }) {
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [patterns, setPatterns] = useState<PatternRecord[]>([])
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => readFilters(searchParams))
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { opening, timeClasses, since, minRating, maxRating, color, source, unclassifiedOnly } =
    filters

  /** Mirror the filters into the address bar so a reload — or a shared link — restores the view. */
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname + writeFilters(filters))
  }, [filters])

  const patch = useCallback((changes: Partial<Filters>) => {
    setFilters(prev => ({ ...prev, ...changes }))
    setLimit(PAGE_SIZE)
  }, [])

  useEffect(() => {
    getGames(userId).then(setGames)
    getPatterns(userId).then(setPatterns)
  }, [userId])

  /** Every position each game passed through, so switching variations is instant. */
  const positionKeys = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const game of games ?? []) map.set(game.id, gamePositionKeys(game.moves))
    return map
  }, [games])

  const tree = useMemo(() => buildPatternTree(patterns), [patterns])
  const allNodes = useMemo(() => flattenTree(tree), [tree])
  const path = useMemo(
    () => (opening === ALL_OPENINGS ? [] : findPath(tree, opening)),
    [tree, opening],
  )
  const current = path.length > 0 ? path[path.length - 1] : null
  const parent = path.length > 1 ? path[path.length - 2] : null

  /** Every game passing the date / rating / format filters and the selected variation. */
  const scoped = useMemo(() => {
    const now = new Date()
    return (games ?? []).filter(game => {
      if (!matchesCriteria(game, filters, now)) return false
      if (!current) return true
      return gameMatchesNode(game, positionKeys.get(game.id) ?? new Set(), current)
    })
  }, [games, filters, current, positionKeys])

  const split = useMemo(() => computeSplit(scoped), [scoped])
  const clock = useMemo(() => computeClockStats(scoped), [scoped])
  const phases = useMemo(() => computePhases(scoped), [scoped])
  /**
   * Games the breakdown table cannot place: with nothing selected, games that reached
   * no saved opening at all; inside a variation, games that reached it but none of its
   * sub-variations. Same set as the table's catch-all row.
   */
  const isUnclassified = useCallback(
    (game: GameRecord) => {
      const lines = current ? current.children : tree
      const keys = positionKeys.get(game.id) ?? new Set<string>()
      return !lines.some(node => gameMatchesNode(game, keys, node))
    },
    [current, tree, positionKeys],
  )

  const listed = useMemo(
    () => (unclassifiedOnly ? scoped.filter(isUnclassified) : scoped),
    [scoped, unclassifiedOnly, isUnclassified],
  )

  /** Which of the saved lines each visible game followed, computed only for the rendered slice. */
  const linesByGame = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const game of listed.slice(0, limit)) {
      const nodes = matchingPath(tree, game, positionKeys.get(game.id) ?? new Set())
      if (nodes.length > 0) map.set(game.id, nodes.map(node => node.pattern.name))
    }
    return map
  }, [listed, limit, tree, positionKeys])

  /** One row per sub-variation of the current selection, or per top-level opening. */
  const breakdown = useMemo(() => {
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
        key: node.pattern.id,
        name: patternLabel(node.pattern),
        note: formatMoves(node.pattern.moves),
        stats: computeStats(matching),
        think: matchingClock.medianPerMove,
        flagged: matchingClock.timeoutPctOfLosses,
        onSelect: () => patch({ opening: node.pattern.id }),
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
          ? 'Reached ' + patternLabel(current.pattern) + ' but no saved sub-variation'
          : undefined,
        stats: computeStats(rest),
        think: restClock.medianPerMove,
        flagged: restClock.timeoutPctOfLosses,
        onSelect: () => patch({ unclassifiedOnly: true }),
      })
    }

    return rows
  }, [scoped, current, tree, positionKeys, patch])

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
        label: parent ? patternLabel(parent.pattern) : 'All games',
        onSelect: () => patch({ opening: parent ? parent.pattern.id : ALL_OPENINGS }),
      }
    : undefined

  return (
    <>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Filters</h2>
          {isFiltered && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Reset
            </button>
          )}
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
                <option key={node.pattern.id} value={node.pattern.id}>
                  {'— '.repeat(node.depth)}
                  {patternLabel(node.pattern)}
                </option>
              ))}
            </select>

            {path.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <button
                  onClick={() => patch({ opening: ALL_OPENINGS })}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  All games
                </button>
                {path.map((node, index) => (
                  <span key={node.pattern.id} className="flex items-center gap-1.5">
                    <span className="text-zinc-700">›</span>
                    <button
                      onClick={() => patch({ opening: node.pattern.id })}
                      className={
                        index === path.length - 1
                          ? 'text-zinc-200'
                          : 'text-zinc-400 hover:text-zinc-100 transition-colors'
                      }
                    >
                      {patternLabel(node.pattern)}
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

          <FilterLabel>Format</FilterLabel>
          <div className="flex gap-1.5 flex-wrap">
            <Chip active={timeClasses.length === 0} onClick={() => patch({ timeClasses: [] })}>
              any
            </Chip>
            {TIME_CLASSES.map(timeClass => (
              <Chip
                key={timeClass}
                active={timeClasses.includes(timeClass)}
                onClick={() => patch({ timeClasses: toggle(timeClasses, timeClass) })}
              >
                {timeClass}
              </Chip>
            ))}
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
          ? `${scoped.length} of ${games.length} games reached ${patternLabel(current.pattern)} or one of its sub-variations.`
          : `${scoped.length} of ${games.length} games in scope.`}
        {patterns.length === 0 && (
          <>
            {' '}
            <Link href="/patterns" className="underline text-zinc-300">
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

      <ThinkPanel phases={phases} />

      {breakdown.length > 0 ? (
        <VariationTable
          title={current ? `Sub-variations of ${patternLabel(current.pattern)}` : 'By opening'}
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
              No sub-variations saved under {patternLabel(current.pattern)} yet —{' '}
              <Link href="/patterns" className="underline text-zinc-400">
                add a longer line
              </Link>{' '}
              and it will nest here.
            </p>
          </div>
        )
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-sm">Games ({listed.length})</h2>
          <div className="flex gap-2 flex-wrap">
            {patterns.length > 0 && (
              <Chip
                active={unclassifiedOnly}
                onClick={() => patch({ unclassifiedOnly: !unclassifiedOnly })}
                title={
                  current
                    ? 'Only games that reached no saved sub-variation of this line'
                    : 'Only games that reached none of your saved openings'
                }
              >
                {current ? 'no sub-variation' : 'not in a saved opening'}
              </Chip>
            )}
          </div>
        </div>

        {listed.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">No games match these filters.</div>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
              {listed.slice(0, limit).map(game => (
                <GameRow key={game.id} game={game} line={linesByGame.get(game.id) ?? []} />
              ))}
            </div>
            {listed.length > limit && (
              <button
                onClick={() => setLimit(prev => prev + PAGE_SIZE)}
                className="self-center text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Show more ({listed.length - limit} left)
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
