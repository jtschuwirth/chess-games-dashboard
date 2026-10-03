'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import Board from '@/components/Board'
import MoveList from '@/components/MoveList'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import ReviewEditor from '@/components/ReviewEditor'
import { replayGame } from '@/lib/board'
import { alignClocks, parseTimeControl, timeSpentPerPly } from '@/lib/clocks'
import { AnalysisStopped, ENGINE_DEPTH, analyzeGame, buildAnnotatedPgn } from '@/lib/analysis'
import { terminateEngine } from '@/lib/engine'
import { readFilters, writeFilters } from '@/lib/dashboard-filters'
import { getGames, getPatterns, saveAnalysis } from '@/lib/firestore'
import { buildPatternTree, matchingPath, patternLabel } from '@/lib/pattern'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import { formatEval, hasReview, isFault, knownTags } from '@/lib/review'
import { endingOf } from '@/lib/termination'
import { SOURCE_LABEL } from '@/types/chess'
import type { Color, GameRecord, GameResult, GameReview, PatternRecord } from '@/types/chess'

const RESULT_COLOR: Record<GameResult, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  draw: 'text-zinc-400',
}

const RESULT_LABEL: Record<GameResult, string> = { win: 'Win', loss: 'Loss', draw: 'Draw' }

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

interface Neighbours {
  previous: GameRecord | null
  next: GameRecord | null
  /** The next game in the slice you have not taken apart yet. */
  nextUnreviewed: GameRecord | null
  /** This game's place in the slice, 1-based. Null when the filters exclude it. */
  position: number | null
  total: number
}

/** One control in the row under the board; they share the board's width. */
function NavButton({
  onClick,
  disabled,
  title,
  wide = false,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  /** The stepping buttons carry the row; first, last and flip stay narrow. */
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`${
        wide ? 'flex-[1.6]' : 'flex-1'
      } py-1.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:hover:bg-zinc-900 text-sm leading-none`}
    >
      {children}
    </button>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-200">{value}</span>
    </div>
  )
}

/**
 * Runs the engine over this one game. The batch panel on the dashboard covers a whole
 * branch of the repertoire; here you are looking at a single game and want its marks
 * before you start explaining them.
 */
function AnalyseGame({
  userId,
  game,
  onDone,
}: {
  userId: string
  game: GameRecord
  onDone: (game: GameRecord) => void
}) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; elapsedMs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    setProgress({ done: 0, elapsedMs: 0 })

    // measured here rather than during render, where reading the clock is not allowed
    const startedAt = Date.now()
    let done = 0

    try {
      const analysis = await analyzeGame(game, {
        depth: ENGINE_DEPTH,
        onPosition: () => {
          done++
          setProgress({ done, elapsedMs: Date.now() - startedAt })
        },
      })
      const pgn = buildAnnotatedPgn(game, analysis)
      await saveAnalysis(userId, game.id, analysis, pgn)
      onDone({ ...game, analysis, annotatedPgn: pgn })
    } catch (caught) {
      if (!(caught instanceof AnalysisStopped)) {
        setError(caught instanceof Error ? caught.message : 'Analysis failed.')
      }
    } finally {
      terminateEngine()
      setRunning(false)
    }
  }

  // two evaluations per move of yours, which is what the progress counts against
  const total = game.moves.length
  const left =
    progress && progress.done > 0
      ? ((total - progress.done) * progress.elapsedMs) / progress.done
      : 0

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={run}
        disabled={running}
        title={`Depth ${ENGINE_DEPTH}. Thorough and slow — a long game can take several minutes.`}
        className="px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-100 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-40"
      >
        {running
          ? `Analysing… ${progress?.done ?? 0}/${total}`
          : game.analysis
            ? `Re-analyse at depth ${ENGINE_DEPTH}`
            : `Analyse at depth ${ENGINE_DEPTH}`}
      </button>
      {running && <Spinner size="w-3.5 h-3.5" />}
      {running && progress && (
        <span className="text-xs text-zinc-500">
          {duration(progress.elapsedMs)} elapsed
          {left > 0 && ` · ~${duration(left)} left`}
        </span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

function GameBody({ userId, gameId }: { userId: string; gameId: string }) {
  const searchParams = useSearchParams()
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [patterns, setPatterns] = useState<PatternRecord[]>([])
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  /**
   * Index of the last move played on the board, -1 for the starting position, or null
   * until you move it yourself — which is what lets the board open on the move worth
   * looking at without jumping back there every time the game is saved.
   */
  const [shown, setShown] = useState<number | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [copied, setCopied] = useState(false)

  /** The dashboard's filters ride along in the URL, so Back lands where you left. */
  const search = useMemo(() => writeFilters(readFilters(searchParams)), [searchParams])
  const filters = useMemo(() => readFilters(searchParams), [searchParams])

  /** State only moves in the callbacks: setting it synchronously here would cascade. */
  const load = useCallback(
    (options?: { fresh: true }) =>
      Promise.all([getGames(userId, options), getPatterns(userId, options)])
        .then(([loadedGames, loadedPatterns]) => {
          setGames(loadedGames)
          setPatterns(loadedPatterns)
          setLoadError(null)
        })
        .catch(caught => {
          setLoadError(errorText(caught, 'Could not load this game from Firestore.'))
        }),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  const game = games?.find(entry => entry.id === gameId) ?? null

  /** A game missing from the cached collection is worth one server read before giving up. */
  useEffect(() => {
    if (games === null || game || missing) return

    let cancelled = false
    getGames(userId, { fresh: true })
      .then(fresh => {
        if (cancelled) return
        setGames(fresh)
        if (!fresh.some(entry => entry.id === gameId)) setMissing(true)
      })
      .catch(caught => {
        if (!cancelled) setLoadError(errorText(caught, 'Could not re-read your games.'))
      })

    return () => {
      cancelled = true
    }
  }, [games, game, missing, userId, gameId])

  const replay = useMemo(() => replayGame(game?.moves ?? []), [game])

  /** Where the board opens: the first move the review names, else the engine's worst find. */
  const openingPly = useMemo(() => {
    const reviewed = game?.review?.mistakes.map(mistake => mistake.ply) ?? []
    if (reviewed.length > 0) return Math.min(...reviewed)

    const worst = [...(game?.analysis?.moves ?? [])]
      .filter(move => move.tag === '??' || move.tag === '?')
      .sort((a, b) => b.cpLoss - a.cpLoss)[0]

    return worst?.ply ?? -1
  }, [game])

  const cursor = shown ?? openingPly

  const step = useCallback(
    (delta: number) => {
      setShown(current =>
        Math.max(-1, Math.min(replay.plies.length - 1, (current ?? openingPly) + delta)),
      )
    },
    [replay.plies.length, openingPly],
  )

  /** Arrow keys step through the game, unless you are typing in the review. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'ArrowRight') step(1)
      else if (event.key === 'Home') setShown(-1)
      else if (event.key === 'End') setShown(replay.plies.length - 1)
      else return

      event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, replay.plies.length])

  /** Seconds spent on each ply, both sides, where the game carries clock readings. */
  const spentByPly = useMemo(() => {
    const map = new Map<number, number>()
    if (!game?.clocks) return map

    const control = parseTimeControl(game.timeControl)
    if (!control) return map

    const clocks = alignClocks(game.clocks, game.moves.length)
    if (!clocks) return map

    timeSpentPerPly(clocks, control).forEach((seconds, index) => map.set(index, seconds))
    return map
  }, [game])

  const remainingByPly = useMemo(() => {
    const map = new Map<number, number>()
    if (!game?.clocks) return map

    const clocks = alignClocks(game.clocks, game.moves.length)
    clocks?.forEach((seconds, index) => map.set(index, Math.round(seconds)))
    return map
  }, [game])

  const engineTags = useMemo(() => {
    const map = new Map<number, string>()
    for (const move of game?.analysis?.moves ?? []) {
      if (isFault(move.tag)) map.set(move.ply, move.tag)
    }
    return map
  }, [game])

  const reviewedPlies = useMemo(
    () => new Set((game?.review?.mistakes ?? []).map(mistake => mistake.ply)),
    [game],
  )

  const tree = useMemo(() => buildPatternTree(patterns), [patterns])

  /** One replay of every game, kept off the filter path so changing a filter is cheap. */
  const keys = useMemo(() => positionKeyMap(games ?? []), [games])

  const line = useMemo(() => {
    if (!game) return []
    return matchingPath(tree, game, keys.get(game.id) ?? new Set()).map(node =>
      patternLabel(node.pattern),
    )
  }, [tree, game, keys])

  /**
   * Where this game sits in the slice the dashboard was showing, so a review session
   * can walk the branch it filtered to without going back to the list each time.
   */
  const neighbours = useMemo<Neighbours>(() => {
    const none: Neighbours = {
      previous: null,
      next: null,
      nextUnreviewed: null,
      position: null,
      total: 0,
    }
    if (!games || !game) return none

    const scoped = scopeGames(games, tree, keys, filters)
    const index = scoped.findIndex(entry => entry.id === game.id)
    if (index === -1) return { ...none, total: scoped.length }

    return {
      previous: index > 0 ? scoped[index - 1] : null,
      next: index < scoped.length - 1 ? scoped[index + 1] : null,
      nextUnreviewed: scoped.slice(index + 1).find(entry => !hasReview(entry)) ?? null,
      position: index + 1,
      total: scoped.length,
    }
  }, [games, game, tree, keys, filters])

  const suggestedTags = useMemo(() => knownTags(games ?? []), [games])

  function applyReview(review: GameReview | null) {
    setGames(prev =>
      (prev ?? []).map(entry =>
        entry.id === gameId
          ? ({ ...entry, review: review ?? undefined } as GameRecord)
          : entry,
      ),
    )
  }

  function applyAnalysed(updated: GameRecord) {
    setGames(prev => (prev ?? []).map(entry => (entry.id === updated.id ? updated : entry)))
  }

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

  if (games === null || (!game && !missing)) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="py-16 text-center text-zinc-500">
        That game is not in your collection.{' '}
        <Link href={`/dashboard${search}`} className="underline text-zinc-200">
          Back to the dashboard
        </Link>
        .
      </div>
    )
  }

  const other: Color = game.color === 'white' ? 'black' : 'white'
  const orientation = flipped ? other : game.color
  const current = cursor >= 0 ? replay.plies[cursor] : null
  const fen = replay.fens[Math.min(cursor + 1, replay.fens.length - 1)]
  const analysed = game.analysis
  const shownMove = analysed?.moves.find(move => move.ply === cursor)

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/dashboard${search}`}
          className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          ← Dashboard
        </Link>

        <div className="flex items-center gap-3 text-xs">
          {neighbours.position && (
            <span className="text-zinc-600">
              {neighbours.position} of {neighbours.total} in this slice
            </span>
          )}
          {neighbours.previous && (
            <Link
              href={`/games/${neighbours.previous.id}${search}`}
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              ‹ Newer
            </Link>
          )}
          {neighbours.next && (
            <Link
              href={`/games/${neighbours.next.id}${search}`}
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Older ›
            </Link>
          )}
          {neighbours.nextUnreviewed && (
            <Link
              href={`/games/${neighbours.nextUnreviewed.id}${search}`}
              className="text-zinc-200 hover:text-white transition-colors"
            >
              Next unreviewed ›
            </Link>
          )}
        </div>
      </div>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3 flex-wrap">
          <span className={`text-lg font-bold ${RESULT_COLOR[game.result]}`}>
            {RESULT_LABEL[game.result]}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-zinc-300">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                game.color === 'white' ? 'bg-white' : 'bg-black ring-1 ring-zinc-500'
              }`}
            />
            as {game.color === 'white' ? 'White' : 'Black'}
          </span>
          <span className="text-sm text-zinc-100">
            vs {game.opponent}
            {game.opponentRating ? ` (${game.opponentRating})` : ''}
          </span>
          {hasReview(game) && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
              reviewed
            </span>
          )}
          <a
            href={game.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            On {SOURCE_LABEL[game.source]} ↗
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Fact label="Played" value={new Date(game.playedAt).toLocaleDateString()} />
          <Fact label="Control" value={`${game.timeControl} · ${game.timeClass}`} />
          <Fact label="Ended by" value={endingOf(game)} />
          <Fact
            label="Engine"
            value={
              analysed ? (
                <span className="font-mono text-xs">
                  <span className="text-red-400">{analysed.blunders}??</span>{' '}
                  <span className="text-amber-400">{analysed.mistakes}?</span>{' '}
                  <span className="text-zinc-600">d{analysed.depth}</span>
                </span>
              ) : (
                <span className="text-zinc-600 text-sm">not analysed</span>
              )
            }
          />
        </div>

        <div className="text-xs">
          {line.length > 0 ? (
            <span className="text-zinc-400">{line.join(' › ')}</span>
          ) : (
            <span className="text-zinc-600">
              {game.openingName ?? 'Unknown opening'} — not in a saved line
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <AnalyseGame userId={userId} game={game} onDone={applyAnalysed} />
          {game.annotatedPgn && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(game.annotatedPgn as string)
                setCopied(true)
              }}
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              {copied ? 'PGN copied' : 'Copy annotated PGN'}
            </button>
          )}
        </div>
      </section>

      {/*
        Fixed tracks, not content-sized ones. With `minmax(0,28rem)` the column took
        its width from whatever sat under the board, so the readout growing by a
        clock reading resized the board itself from move to move.
      */}
      <section className="grid grid-cols-1 md:grid-cols-[28rem_17rem] gap-4 items-start justify-center">
        <div className="flex flex-col gap-2 w-full max-w-[28rem] mx-auto">
          <Board
            fen={fen}
            orientation={orientation}
            highlight={current ? [current.from, current.to] : []}
          />

          <div className="flex items-center gap-1.5">
            <NavButton onClick={() => setShown(-1)} disabled={cursor < 0} title="Start">
              ⏮
            </NavButton>
            <NavButton onClick={() => step(-1)} disabled={cursor < 0} title="Previous move" wide>
              ‹
            </NavButton>

            <span className="flex-[2.4] text-center text-xs font-mono text-zinc-300 tabular-nums truncate">
              {current ? (
                <>
                  {current.moveNumber}
                  {current.color === 'white' ? '.' : '…'} {current.san}
                  <span className="text-zinc-600">
                    {' '}
                    {cursor + 1}/{replay.plies.length}
                  </span>
                </>
              ) : (
                <span className="text-zinc-600">start</span>
              )}
            </span>

            <NavButton
              onClick={() => step(1)}
              disabled={cursor >= replay.plies.length - 1}
              title="Next move"
              wide
            >
              ›
            </NavButton>
            <NavButton
              onClick={() => setShown(replay.plies.length - 1)}
              disabled={cursor >= replay.plies.length - 1}
              title="End"
            >
              ⏭
            </NavButton>
            <NavButton onClick={() => setFlipped(value => !value)} title="Flip the board">
              ⇅
            </NavButton>
          </div>

          <div className="text-xs text-zinc-600 flex gap-3 flex-wrap items-center">
            {shownMove && (
              <span
                className="font-mono text-zinc-400"
                title="From White's side, the way a board shows it"
              >
                {formatEval(shownMove.cpBefore, game.color)} →{' '}
                {formatEval(shownMove.cpAfter, game.color)}
                {isFault(shownMove.tag) && (
                  <span className="text-amber-400"> {shownMove.tag}</span>
                )}
              </span>
            )}
            {current && spentByPly.has(current.index) && (
              <span>{spentByPly.get(current.index)}s spent</span>
            )}
            {current && remainingByPly.has(current.index) && (
              <span>{remainingByPly.get(current.index)}s left</span>
            )}
            <span className="text-zinc-700 ml-auto">← → to step</span>
          </div>
        </div>

        <div className="flex flex-col w-full max-w-[28rem] md:max-w-none mx-auto border border-zinc-800 rounded-xl overflow-hidden max-h-[28rem] bg-zinc-900">
          <div className="px-3 py-2 border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500 shrink-0">
            Moves
          </div>
          <MoveList
            plies={replay.plies}
            current={cursor}
            onPick={setShown}
            tags={engineTags}
            reviewed={reviewedPlies}
            secondsByPly={spentByPly}
          />
          {replay.truncated && (
            <p className="px-3 py-2 text-xs text-amber-400 border-t border-zinc-800">
              The stored move list stopped parsing part way through.
            </p>
          )}
        </div>
      </section>

      <ReviewEditor
        userId={userId}
        game={game}
        plies={replay.plies}
        suggestedTags={suggestedTags}
        onShowPly={setShown}
        onSaved={applyReview}
      />
    </>
  )
}

export default function GamePage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Game review" wide>
      {user => (
        <Suspense
          fallback={
            <div className="py-16 flex justify-center">
              <Spinner size="w-6 h-6" />
            </div>
          }
        >
          {/* keyed so moving to the next game resets the board and the review form */}
          <GameBody key={params.id} userId={user.uid} gameId={params.id} />
        </Suspense>
      )}
    </PageShell>
  )
}
