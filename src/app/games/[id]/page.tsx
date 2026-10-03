'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import Board from '@/components/Board'
import MoveList from '@/components/MoveList'
import EnginePanel from '@/components/EnginePanel'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import ReviewEditor from '@/components/ReviewEditor'
import { playLine as playLineMoves, replayGame } from '@/lib/board'
import {
  alignClocks,
  formatClock,
  formatDuration,
  parseTimeControl,
  timeSpentPerPly,
} from '@/lib/clocks'
import { readFilters, writeFilters } from '@/lib/dashboard-filters'
import { getGames, getPatterns } from '@/lib/firestore'
import { buildPatternTree, matchingPath, patternLabel } from '@/lib/pattern'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import { betterMovesOf, formatEval, hasReview, isFault, knownTags } from '@/lib/review'
import { endingOf } from '@/lib/termination'
import { SOURCE_LABEL } from '@/types/chess'
import type {
  Color,
  GameRecord,
  GameResult,
  GameReview,
  PatternRecord,
  ProposedMove,
} from '@/types/chess'

const RESULT_COLOR: Record<GameResult, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  draw: 'text-zinc-400',
}

const RESULT_LABEL: Record<GameResult, string> = { win: 'Win', loss: 'Loss', draw: 'Draw' }

/** How long something took, as opposed to what a clock reads. */
interface Variation {
  /** The ply it branches at — the move you played instead. */
  ply: number
  /** Which of the lines saved at that ply, so the move list can mark the right one. */
  lineIndex: number
  line: string[]
  fens: string[]
  squares: { from: string; to: string }[]
  /** How far into the line the board is. */
  index: number
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
  /**
   * A line from your review, played out on the board instead of the game's own
   * continuation. Null when the board is following what actually happened.
   */
  const [variation, setVariation] = useState<Variation | null>(null)

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
      // while a variation is open the controls walk it, and stepping back past its
      // first move returns you to the game at the branch point
      if (variation) {
        setVariation(current => {
          if (!current) return current
          const next = current.index + delta
          if (next < 0) return null
          if (next >= current.fens.length) return current
          return { ...current, index: next }
        })
        return
      }

      setShown(current =>
        Math.max(-1, Math.min(replay.plies.length - 1, (current ?? openingPly) + delta)),
      )
    },
    [replay.plies.length, openingPly, variation],
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

  /** Every line you proposed, by the ply it replaces, for the move list to nest. */
  const linesByPly = useMemo(() => {
    const map = new Map<number, ProposedMove[]>()
    for (const mistake of game?.review?.mistakes ?? []) {
      const lines = betterMovesOf(mistake).filter(move => move.line.length > 0)
      if (lines.length > 0) map.set(mistake.ply, lines)
    }
    return map
  }, [game])

  /** Puts the board on one of them, at whichever move of it was clicked. */
  const playLine = useCallback(
    (ply: number, lineIndex: number, moveIndex: number) => {
      const move = linesByPly.get(ply)?.[lineIndex]
      const from = replay.fens[ply]
      if (!move || !from) return

      const played = playLineMoves(from, move.line)
      if (played.line.length === 0) return

      setVariation({
        ply,
        lineIndex,
        line: played.line,
        fens: played.fens,
        squares: played.squares,
        index: Math.min(moveIndex, played.fens.length - 1),
      })
    },
    [linesByPly, replay.fens],
  )

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
  const variationSquare = variation?.squares[variation.index]
  const fen = variation
    ? variation.fens[variation.index]
    : replay.fens[Math.min(cursor + 1, replay.fens.length - 1)]
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
            {game.color === 'white' ? 'White' : 'Black'}
          </span>
          <span className="text-sm text-zinc-100">
            vs {game.opponent}
            {game.opponentRating ? ` (${game.opponentRating})` : ''}
          </span>
          {hasReview(game) && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
              ◆ reviewed
            </span>
          )}
          {/* same icon and colour as the game list, so the two views read alike */}
          {analysed && (
            <span
              className="px-2 py-0.5 text-xs font-mono rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"
              title={`The engine has been over this game at depth ${analysed.depth}`}
            >
              ⚙ d{analysed.depth}
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

      </section>

      <EnginePanel userId={userId} game={game} onDone={applyAnalysed} />

      {/*
        Fixed tracks, not content-sized ones. With `minmax(0,28rem)` the column took
        its width from whatever sat under the board, so the readout growing by a
        clock reading resized the board itself from move to move.
      */}
      <section className="grid grid-cols-1 md:grid-cols-[28rem_19rem] gap-4 items-start justify-center">
        <div className="flex flex-col gap-2 w-full max-w-[28rem] mx-auto">
          <Board
            fen={fen}
            orientation={orientation}
            highlight={
              variationSquare
                ? [variationSquare.from, variationSquare.to]
                : current
                  ? [current.from, current.to]
                  : []
            }
          />

          <div className="flex items-center gap-1.5">
            <NavButton
              onClick={() => (variation ? setVariation(null) : setShown(-1))}
              disabled={!variation && cursor < 0}
              title={variation ? 'Back to the game' : 'Start'}
            >
              ⏮
            </NavButton>
            <NavButton
              onClick={() => step(-1)}
              disabled={!variation && cursor < 0}
              title="Previous move"
              wide
            >
              ‹
            </NavButton>

            <span className="flex-[2.4] text-center text-xs font-mono text-zinc-300 tabular-nums truncate">
              {variation ? (
                <span className="text-sky-300">
                  {variation.line[variation.index]}
                  <span className="text-zinc-600">
                    {' '}
                    {variation.index + 1}/{variation.line.length}
                  </span>
                </span>
              ) : current ? (
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
              disabled={
                variation
                  ? variation.index >= variation.fens.length - 1
                  : cursor >= replay.plies.length - 1
              }
              title="Next move"
              wide
            >
              ›
            </NavButton>
            <NavButton
              onClick={() =>
                variation
                  ? setVariation({ ...variation, index: variation.fens.length - 1 })
                  : setShown(replay.plies.length - 1)
              }
              disabled={
                variation
                  ? variation.index >= variation.fens.length - 1
                  : cursor >= replay.plies.length - 1
              }
              title="End"
            >
              ⏭
            </NavButton>
            <NavButton onClick={() => setFlipped(value => !value)} title="Flip the board">
              ⇅
            </NavButton>
          </div>

          <div className="text-xs text-zinc-600 flex gap-3 flex-wrap items-center">
            {!variation && shownMove && (
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
            {/*
              Both readings belong to the move highlighted on the board, which has
              already been played — and on an opponent's move it is their clock, not
              yours. Unattributed numbers side by side read as being about the move
              you are looking for next.
            */}
            {!variation && current && spentByPly.has(current.index) && (
              <span>
                {current.color === game.color ? 'You' : 'Your opponent'} took{' '}
                {formatDuration(spentByPly.get(current.index) as number)} here
                {remainingByPly.has(current.index) &&
                  `, ${formatClock(remainingByPly.get(current.index) as number)} left`}
              </span>
            )}
            <span className="text-zinc-700 ml-auto">← → to step</span>
          </div>
        </div>

        <div className="flex flex-col w-full max-w-[28rem] md:max-w-none mx-auto border border-zinc-800 rounded-xl overflow-hidden max-h-[28rem] bg-zinc-900">
          <div className="px-3 py-2 border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500 shrink-0 flex items-center justify-between gap-2">
            <span>Moves</span>
            {variation && (
              <button
                onClick={() => setVariation(null)}
                className="normal-case tracking-normal text-sky-400 hover:text-sky-200 transition-colors"
              >
                leave the line
              </button>
            )}
          </div>
          <MoveList
            plies={replay.plies}
            current={cursor}
            onPick={index => {
              setVariation(null)
              setShown(index)
            }}
            tags={engineTags}
            reviewed={reviewedPlies}
            secondsByPly={spentByPly}
            yourColor={game.color}
            linesByPly={linesByPly}
            onPlayLine={playLine}
            active={
              variation
                ? {
                    ply: variation.ply,
                    lineIndex: variation.lineIndex,
                    moveIndex: variation.index,
                  }
                : null
            }
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
