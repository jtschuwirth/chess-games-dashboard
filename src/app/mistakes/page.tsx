'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AccuracyPanel from '@/components/AccuracyPanel'
import FilterPanel from '@/components/FilterPanel'
import MistakeHeatmap from '@/components/MistakeHeatmap'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import ReviewPanel from '@/components/ReviewPanel'
import VerdictPanel from '@/components/VerdictPanel'
import { THINK_BANDS } from '@/lib/accuracy'
import { formatDuration, gamePhases, timeControlsIn } from '@/lib/clocks'
import {
  ALL_OPENINGS,
  UNCLASSIFIED_OPENING,
  readFilters,
  writeFilters,
  type Filters,
} from '@/lib/dashboard-filters'
import { getGames, getOpenings, getPatterns } from '@/lib/firestore'
import {
  NO_MISTAKE_FILTER,
  PIECES,
  PIECE_FIGURINE,
  PIECE_LABEL,
  activeMarks,
  countBy,
  markTint,
  matchesMistake,
  mistakeRows,
  timedCount,
  type MistakeFilter,
  type Piece,
} from '@/lib/mistakes'
import { buildOpeningTree, findPath, flattenTree } from '@/lib/opening'
import { patternTags } from '@/lib/pattern'
import { formatEval, markColor } from '@/lib/review'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import type { GameRecord, OpeningLine, PatternRecord } from '@/types/chess'

/** How many rows before the list becomes a page you scroll rather than read. */
const PAGE_SIZE = 60

function MistakesBody({ userId }: { userId: string }) {
  const searchParams = useSearchParams()
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [patterns, setPatterns] = useState<PatternRecord[]>([])
  const [filters, setFilters] = useState<Filters>(() => readFilters(searchParams))
  /** The four this page adds. They are not in the query string the game view reads. */
  const [mistakeFilter, setMistakeFilter] = useState<MistakeFilter>(NO_MISTAKE_FILTER)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  /** The same mirror the games dashboard keeps, so a link restores the same slice. */
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname + writeFilters(filters))
  }, [filters])

  const patch = useCallback((changes: Partial<Filters>) => {
    setFilters(prev => ({ ...prev, ...changes }))
    setLimit(PAGE_SIZE)
  }, [])

  const load = useCallback(
    (options?: { fresh: true }) =>
      Promise.all([
        getGames(userId, options),
        getOpenings(userId, options),
        getPatterns(userId, options),
      ])
        .then(([loadedGames, loadedOpenings, loadedPatterns]) => {
          setGames(loadedGames)
          setOpenings(loadedOpenings)
          setPatterns(loadedPatterns)
          setLoadError(null)
        })
        .catch(caught =>
          setLoadError(errorText(caught, 'Could not load your games from Firestore.')),
        ),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(() => {
    setRefreshing(true)
    load({ fresh: true }).finally(() => setRefreshing(false))
  }, [load])

  const tree = useMemo(() => buildOpeningTree(openings), [openings])
  const allNodes = useMemo(() => flattenTree(tree), [tree])
  const positionKeys = useMemo(() => positionKeyMap(games ?? []), [games])
  const availableControls = useMemo(() => timeControlsIn(games ?? []), [games])
  const patternTagList = useMemo(() => patternTags(patterns), [patterns])

  const path = useMemo(
    () =>
      filters.opening === ALL_OPENINGS || filters.opening === UNCLASSIFIED_OPENING
        ? []
        : findPath(tree, filters.opening),
    [tree, filters.opening],
  )

  const scoped = useMemo(
    () => scopeGames(games ?? [], tree, positionKeys, filters),
    [games, tree, positionKeys, filters],
  )

  /*
   * Every marked move in the slice, before this page's own two filters. The chips are
   * counted against this rather than against the filtered rows, so each one says what it
   * would give you — otherwise every chip but the active one reads zero, which is the
   * rule the patterns finder already follows.
   */
  const all = useMemo(() => mistakeRows(scoped), [scoped])
  const rows = useMemo(
    () => all.filter(row => matchesMistake(row, mistakeFilter)),
    [all, mistakeFilter],
  )

  const marks = useMemo(() => activeMarks(), [])
  const byMark = useMemo(() => countBy(all, row => row.tag), [all])
  const byPiece = useMemo(() => countBy(all, row => row.piece), [all])
  const byPhase = useMemo(() => countBy(all, row => row.phase ?? ''), [all])
  const byThink = useMemo(() => countBy(all, row => row.thinkBand ?? ''), [all])
  /* a game synced before clocks were captured has no think to report, and saying so is
     the only way the chips below can fail to add up to the total without reading as a bug */
  const timed = useMemo(() => timedCount(all), [all])

  const search = useMemo(() => writeFilters(filters), [filters])

  if (loadError) return <LoadError message={loadError} onRetry={() => load()} />
  if (!games) return <Spinner />

  const toggleMark = (mark: string) =>
    setMistakeFilter(current => ({
      ...current,
      marks: current.marks.includes(mark)
        ? current.marks.filter(entry => entry !== mark)
        : [...current.marks, mark],
    }))

  const togglePiece = (piece: Piece) =>
    setMistakeFilter(current => ({
      ...current,
      pieces: current.pieces.includes(piece)
        ? current.pieces.filter(entry => entry !== piece)
        : [...current.pieces, piece],
    }))

  const togglePhase = (label: string) =>
    setMistakeFilter(current => ({
      ...current,
      phases: current.phases.includes(label)
        ? current.phases.filter(entry => entry !== label)
        : [...current.phases, label],
    }))

  const toggleThink = (label: string) =>
    setMistakeFilter(current => ({
      ...current,
      think: current.think.includes(label)
        ? current.think.filter(entry => entry !== label)
        : [...current.think, label],
    }))

  const anyMistakeFilter =
    mistakeFilter.marks.length > 0 ||
    mistakeFilter.pieces.length > 0 ||
    mistakeFilter.phases.length > 0 ||
    mistakeFilter.think.length > 0

  return (
    <>
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        patch={patch}
        games={games}
        scoped={scoped}
        allNodes={allNodes}
        openings={openings}
        availableControls={availableControls}
        path={path}
        refresh={refresh}
        refreshing={refreshing}
        extra={
          <div className="flex flex-col gap-3 border-t border-zinc-800 pt-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Mark</span>
              <div className="flex gap-1.5 flex-wrap">
                {marks.map(mark => {
                  const on = mistakeFilter.marks.includes(mark)
                  return (
                    <button
                      key={mark}
                      type="button"
                      onClick={() => toggleMark(mark)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors font-mono ${
                        on
                          ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {mark}
                      <span className={on ? 'text-zinc-500' : 'text-zinc-600'}>
                        {' '}
                        {byMark.get(mark) ?? 0}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Piece moved</span>
              <div className="flex gap-1.5 flex-wrap">
                {PIECES.map(piece => {
                  const on = mistakeFilter.pieces.includes(piece)
                  const count = byPiece.get(piece) ?? 0
                  return (
                    <button
                      key={piece}
                      type="button"
                      onClick={() => togglePiece(piece)}
                      disabled={count === 0}
                      title={PIECE_LABEL[piece]}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors disabled:opacity-30 ${
                        on
                          ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      <span className="text-sm">{PIECE_FIGURINE[piece]}</span>{' '}
                      <span className={on ? 'text-zinc-500' : 'text-zinc-600'}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span
                className="text-xs uppercase tracking-wide text-zinc-500"
                title="When the move was played, in your own move numbers — not how long the game lasted"
              >
                Played in
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {gamePhases().map(phase => {
                  const on = mistakeFilter.phases.includes(phase.label)
                  const count = byPhase.get(phase.label) ?? 0
                  return (
                    <button
                      key={phase.label}
                      type="button"
                      onClick={() => togglePhase(phase.label)}
                      disabled={count === 0}
                      title={`${phase.name} — moves ${phase.label}`}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors disabled:opacity-30 ${
                        on
                          ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      <span className="font-mono">{phase.label}</span>{' '}
                      <span className={on ? 'text-zinc-500' : 'text-zinc-600'}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                <span title="Seconds you spent on the move itself, read off the game's own clock readings">
                  Thought for
                </span>
                {timed < all.length && (
                  <span className="normal-case tracking-normal text-zinc-600">
                    {' '}
                    — {timed} of {all.length} are timed
                  </span>
                )}
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {THINK_BANDS.map(band => {
                  const on = mistakeFilter.think.includes(band.label)
                  const count = byThink.get(band.label) ?? 0
                  return (
                    <button
                      key={band.label}
                      type="button"
                      onClick={() => toggleThink(band.label)}
                      disabled={count === 0}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors disabled:opacity-30 ${
                        on
                          ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {band.label}{' '}
                      <span className={on ? 'text-zinc-500' : 'text-zinc-600'}>{count}</span>
                    </button>
                  )
                })}
                {anyMistakeFilter && (
                  <button
                    type="button"
                    onClick={() => setMistakeFilter(NO_MISTAKE_FILTER)}
                    className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        }
      />

      <MistakeHeatmap rows={rows} />

      <AccuracyPanel games={scoped} />

      <VerdictPanel
        userId={userId}
        games={scoped}
        onJudged={judged =>
          setGames(prev => (prev ?? []).map(game => (game.id === judged.id ? judged : game)))
        }
      />

      <ReviewPanel
        patternTags={patternTagList}
        games={scoped}
        activeTag={filters.tag}
        onPickTag={value => patch({ tag: value })}
        hrefFor={game => `/games/${game.id}${search}`}
        drillHref={`/learn${search}`}
      />

      <Panel
        id="mistake-list"
        title="Every mistake"
        meta={`${rows.length}${rows.length === all.length ? '' : ` of ${all.length}`}`}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Nothing marked in this slice. Analyse some games, or widen the filters.
          </p>
        ) : (
          <>
            {/* flush in the panel, like the other wide tables */}
            <div className="-mx-5 flex flex-col divide-y divide-zinc-800/70">
              {rows.slice(0, limit).map(row => (
                <Link
                  key={`${row.game.id}:${row.ply}`}
                  href={`/games/${row.game.id}${search}`}
                  className="grid grid-cols-[7.5rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2 hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="font-mono text-sm text-zinc-200 whitespace-nowrap">
                    {row.moveNumber}
                    {row.game.color === 'white' ? '.' : '…'} {row.san}
                    <span className={markColor(row.tag)}>{row.tag}</span>
                  </span>

                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded text-center"
                    style={{ background: `${markTint(row.tag)}22`, color: markTint(row.tag) }}
                    title={`Landed on ${row.square}`}
                  >
                    {row.square}
                  </span>

                  <span className="text-xs text-zinc-500 min-w-0 truncate">
                    <span className="text-zinc-600">{PIECE_FIGURINE[row.piece]}</span> vs{' '}
                    {row.game.opponent}
                    {row.think !== null && (
                      <span className="text-zinc-600" title="Time spent on this move">
                        {' '}
                        · {formatDuration(row.think)}
                      </span>
                    )}
                    <span className="text-zinc-600">
                      {' '}
                      · {new Date(row.game.playedAt).toLocaleDateString()}
                    </span>
                  </span>

                  <span className="text-xs font-mono text-zinc-500 tabular-nums shrink-0">
                    {formatEval(row.cpBefore, row.game.color)} →{' '}
                    {formatEval(row.cpAfter, row.game.color)}
                  </span>
                </Link>
              ))}
            </div>

            {rows.length > limit && (
              <button
                onClick={() => setLimit(current => current + PAGE_SIZE)}
                className="self-start text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Show {Math.min(PAGE_SIZE, rows.length - limit)} more
              </button>
            )}
          </>
        )}
      </Panel>
    </>
  )
}

export default function MistakesPage() {
  return (
    <PageShell title="Mistakes" wide>
      {user => (
        <Suspense fallback={<Spinner />}>
          <MistakesBody userId={user.uid} />
        </Suspense>
      )}
    </PageShell>
  )
}
