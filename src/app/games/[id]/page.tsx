'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import Board from '@/components/Board'
import MoveList from '@/components/MoveList'
import { branchSources, gameTree, type BranchSource } from '@/lib/game-tree'
import {
  emptyTree,
  fenAt,
  mainPath,
  nodeAt,
  nodesAlong,
  playAt,
  toPgn,
  treeChanged,
  type MoveTree,
  type Path,
} from '@/lib/movetree'
import EnginePanel from '@/components/EnginePanel'
import EvalGraph from '@/components/EvalGraph'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import ReviewEditor from '@/components/ReviewEditor'
import StatusTag from '@/components/StatusTag'
import { replayGame } from '@/lib/board'
import {
  alignClocks,
  formatClock,
  formatDuration,
  parseTimeControl,
  timeSpentPerPly,
} from '@/lib/clocks'
import { opponentMoves } from '@/lib/analysis'
import { onAnalysed } from '@/lib/analysis-queue'
import { readFilters, writeFilters } from '@/lib/dashboard-filters'
import { getGames, getOpenings, getPatterns, getTagGroups, saveVariations } from '@/lib/firestore'
import { buildOpeningTree, matchingPath, openingLabel } from '@/lib/opening'
import { patternTags } from '@/lib/pattern'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import {
  formatEval,
  hasReview,
  isFault,
  markColor,
  reviewedPlies,
} from '@/lib/review'
import { DEFAULT_TAG_GROUPS, type TagGroup } from '@/lib/tags'
import { endingOf } from '@/lib/termination'
import { SOURCE_LABEL } from '@/types/chess'
import type {
  Color,
  GameRecord,
  GameResult,
  GameReview,
  OpeningLine,
  PatternRecord,
} from '@/types/chess'

const RESULT_COLOR: Record<GameResult, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  draw: 'text-zinc-400',
}

const RESULT_LABEL: Record<GameResult, string> = { win: 'Win', loss: 'Loss', draw: 'Draw' }

/** How long something took, as opposed to what a clock reads. */
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
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [patterns, setPatterns] = useState<PatternRecord[]>([])
  const [vocabulary, setVocabulary] = useState<TagGroup[]>(DEFAULT_TAG_GROUPS)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  /**
   * Index of the last move played on the board, -1 for the starting position, or null
   * until you move it yourself — which is what lets the board open on the move worth
   * looking at without jumping back there every time the game is saved.
   */
  const [moved, setMoved] = useState<Path | null>(null)
  const [flipped, setFlipped] = useState(false)
  /**
   * The tree as you have edited it, against the game it was built from.
   *
   * Held beside the derived tree rather than replacing it, and keyed by the game, so
   * loading a different game cannot show you the last one's branches — the same shape
   * as a draft, without an effect writing state back during a render.
   */
  const [edited, setEdited] = useState<{ gameId: string; tree: MoveTree } | null>(null)
  const [savingLines, setSavingLines] = useState(false)

  /** The dashboard's filters ride along in the URL, so Back lands where you left. */
  const search = useMemo(() => writeFilters(readFilters(searchParams)), [searchParams])
  const filters = useMemo(() => readFilters(searchParams), [searchParams])

  /** State only moves in the callbacks: setting it synchronously here would cascade. */
  const load = useCallback(
    (options?: { fresh: true }) =>
      Promise.all([
        getGames(userId, options),
        getOpenings(userId, options),
        getPatterns(userId, options),
        // read from the same user document the games already waited on, so it costs
        // nothing beyond the promise
        getTagGroups(userId),
      ])
        .then(([loadedGames, loadedOpenings, loadedPatterns, loadedTags]) => {
          setGames(loadedGames)
          setOpenings(loadedOpenings)
          setPatterns(loadedPatterns)
          setVocabulary(loadedTags)
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

  /**
   * The game, your saved variations and the review's lines, as one tree.
   *
   * Everything on this page reads it: the board, the move list, the controls. The
   * edited copy wins while it belongs to this game.
   */
  const derived = useMemo(() => (game ? gameTree(game) : emptyTree()), [game])
  const moveTree = edited && edited.gameId === game?.id ? edited.tree : derived

  const sources = useMemo(
    () => (game ? branchSources(game, moveTree) : new Map<string, BranchSource>()),
    [game, moveTree],
  )

  const unsavedLines = useMemo(
    () => Boolean(game && edited?.gameId === game.id && treeChanged(moveTree, derived)),
    [moveTree, derived, edited, game],
  )

  /** Where the board opens, as a path: the move worth looking at, on the main line. */
  const openingPath = useMemo(
    () => mainPath(moveTree, openingPly + 1),
    [moveTree, openingPly],
  )

  const path = moved ?? openingPath
  const onLine = useMemo(
    () => mainPath(moveTree, path.length).join('/') === path.join('/'),
    [moveTree, path],
  )

  /**
   * The ply on the board when it is following the game, and -1 otherwise.
   *
   * Everything that is about the game as played — the clock, the stored evaluation,
   * the highlighted row — asks this, and gets nothing while you are off in a branch.
   * That was already the rule; it used to be spelled `!variation`.
   */
  const cursor = onLine ? path.length - 1 : -1

  /**
   * One move along whichever line you are standing on.
   *
   * Forward follows the first child, which inside a branch is that branch and on the
   * game is the game. Back is one node up, which walks out of a variation into the
   * move it replaced — the behaviour the old `Variation` object spelled out by hand,
   * now just what a path is.
   */
  const step = useCallback(
    (delta: number) => {
      if (delta < 0) {
        setMoved(path.slice(0, -1))
        return
      }

      const children =
        path.length === 0 ? moveTree.children : (nodeAt(moveTree, path)?.children ?? [])
      const next = children[0]
      if (next) setMoved([...path, next.id])
    },
    [moveTree, path],
  )

  /** Arrow keys step through the game, unless you are typing in the review. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'ArrowRight') step(1)
      else if (event.key === 'Home') setMoved([])
      else if (event.key === 'End') setMoved(mainPath(moveTree, replay.plies.length))
      else return

      event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, replay.plies.length, moveTree])

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

  /**
   * What their replies were worth, by ply.
   *
   * The first pass only evaluates your own moves, so a move of theirs had no numbers
   * under the board and the readout went blank on every other move. It does have
   * numbers: their reply sits bracketed between your `cpAfter` and your next
   * `cpBefore`, both already in your frame, which is exactly what `opponentMoves`
   * reads out. Nothing extra is evaluated and nothing extra is stored.
   *
   * Their last reply has no move of yours after it to be bracketed by, so it has no
   * reading — the one move of the game that still shows nothing.
   */
  const theirs = useMemo(
    () => new Map(game ? opponentMoves(game).map(move => [move.ply, move]) : []),
    [game],
  )

  /**
   * The line the board is standing on, counted from a move of the game.
   *
   * Empty unless the board is out on a branch from exactly that move — so an entry
   * only offers to take a line that is actually an alternative to its own move. The
   * branch is already in the tree, because playing it there is what put it there;
   * this just reads the SANs back out of the path.
   */
  const lineOnBoard = useCallback(
    (ply: number): string[] => {
      const at = mainPath(moveTree, ply)
      if (path.length <= at.length) return []
      if (!at.every((id, index) => path[index] === id)) return []
      return nodesAlong(moveTree, path)
        .slice(at.length)
        .map(node => node.san)
    },
    [moveTree, path],
  )

  /** The next move along the line you are standing on, which is what `›` follows. */
  const forward = useMemo(() => {
    const children =
      path.length === 0 ? moveTree.children : (nodeAt(moveTree, path)?.children ?? [])
    return children[0] ?? null
  }, [moveTree, path])

  /**
   * How a move is coloured: the game plain, a line your review proposes in its blue,
   * a line you played out in violet. Three origins, and telling them apart is the
   * whole reason one tree can hold all of them without reading as a muddle.
   */
  const styleOf = useCallback(
    (node: { id: string }) => {
      const from = sources.get(node.id)
      if (from === 'review') return { text: 'text-sky-400', label: 'From your review' }
      if (from === 'note') return { text: 'text-sky-400', label: 'From a note on this move' }
      if (from === 'yours') return { text: 'text-violet-300', label: 'A line you played out' }
      return null
    },
    [sources],
  )

  /**
   * Keeps the variations on the game. Written as PGN with brackets, so it pastes
   * into any board — and the whole game goes with them, since a branch with nothing
   * to hang off is not something anyone can read.
   */
  const saveLines = useCallback(async () => {
    if (!game) return
    setSavingLines(true)
    try {
      const pgn = toPgn(moveTree)
      await saveVariations(userId, game.id, pgn)
      setGames(current =>
        (current ?? []).map(entry =>
          entry.id === game.id ? { ...entry, variationsPgn: pgn } : entry,
        ),
      )
      setEdited(null)
    } catch (caught) {
      setLoadError(errorText(caught, 'Could not save those lines.'))
    } finally {
      setSavingLines(false)
    }
  }, [game, moveTree, userId])

  // every ply the review speaks about, including the ones an entry covers as repeats
  const reviewed = useMemo(() => reviewedPlies(game?.review), [game])

  const tree = useMemo(() => buildOpeningTree(openings), [openings])

  /** One replay of every game, kept off the filter path so changing a filter is cheap. */
  const keys = useMemo(() => positionKeyMap(games ?? []), [games])

  const line = useMemo(() => {
    if (!game) return []
    return matchingPath(tree, game, keys.get(game.id) ?? new Set()).map(node =>
      openingLabel(node.opening),
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

  /** Your patterns, as tags, so a mistake can point at the idea you should have used. */
  const patternTagList = useMemo(() => patternTags(patterns), [patterns])

  function applyReview(review: GameReview | null) {
    setGames(prev =>
      (prev ?? []).map(entry =>
        entry.id === gameId
          ? ({ ...entry, review: review ?? undefined } as GameRecord)
          : entry,
      ),
    )
  }

  /**
   * An analysis the queue finished, which may well be a game queued from the list and
   * then opened to read while it waited — so this page follows the queue rather than
   * only the button in its own panel.
   */
  useEffect(
    () =>
      // not destructured as `gameId`, which is this page's own prop: the queue analyses
      // whichever game it is on, which is not necessarily the one being read
      onAnalysed(result =>
        setGames(prev =>
          (prev ?? []).map(entry =>
            entry.id === result.gameId
              ? { ...entry, analysis: result.analysis, annotatedPgn: result.annotatedPgn }
              : entry,
          ),
        ),
      ),
    [],
  )

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
  /** The move on the board, whichever line it is on. */
  const standing = nodesAlong(moveTree, path).slice(-1)[0] ?? null
  const fen = fenAt(moveTree, path)
  const analysed = game.analysis
  const shownMove = analysed?.moves.find(move => move.ply === cursor)
  const theirMove = theirs.get(cursor)

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
          {/* the same component the game list uses, so the two views cannot drift */}
          {hasReview(game) && <StatusTag tone="review">◆ reviewed</StatusTag>}
          {analysed && (
            <StatusTag
              tone="engine"
              mono
              title={`The engine has been over this game at depth ${analysed.depth}`}
            >
              ⚙ d{analysed.depth}
            </StatusTag>
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

      {/*
        The game as a line, folded away. It carries the descriptor as its own heading,
        which is where it belongs: a name for a shape is worth nothing beside the shape.
      */}
      <EvalGraph game={game} onPickPly={ply => setMoved(mainPath(moveTree, ply + 1))} />

      <EnginePanel userId={userId} game={game} onDone={applyAnalysed} />

      {/*
        Three cells, not two: the board, the controls under it, and the move list beside
        both. The list sits in the board's row alone, so it is exactly as tall as the
        board and scrolls inside — sharing a row with the controls made it overhang the
        board's bottom edge by their height.

        Source order is board, controls, list, which is what a single column should read
        like; the explicit placement only applies from `md` up. `minmax(0,1fr)` matters
        too: a content-sized track took its width from the readout under the board, which
        resized the board itself from move to move.
      */}
      <section className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-[auto_auto] gap-4 md:gap-y-2">
        <div className="w-full max-w-[28rem] md:max-w-none mx-auto md:col-start-1 md:row-start-1">
          {/*
            Playing a move here is how a variation gets made. `playAt` follows a move
            already in the tree instead of adding it twice, so walking a line you have
            entered is the same gesture as entering it, and only the first move that
            differs makes a branch.
          */}
          <Board
            fen={fen}
            orientation={orientation}
            highlight={standing ? [standing.from, standing.to] : []}
            onPlay={move => {
              const played = playAt(moveTree, path, move)
              if (!played) return
              setMoved(played.path)
              if (played.added) setEdited({ gameId: game.id, tree: played.tree })
            }}
          />
        </div>

        <div className="flex flex-col gap-2 w-full max-w-[28rem] md:max-w-none mx-auto md:col-start-1 md:row-start-2">
          <div className="flex items-center gap-1.5">
            <NavButton
              onClick={() => setMoved([])}
              disabled={path.length === 0}
              title="Start"
            >
              ⏮
            </NavButton>
            <NavButton
              onClick={() => step(-1)}
              disabled={path.length === 0}
              title="Previous move"
              wide
            >
              ‹
            </NavButton>

            <span className="flex-[2.4] text-center text-xs font-mono text-zinc-300 tabular-nums truncate">
              {!standing ? (
                <span className="text-zinc-600">start</span>
              ) : onLine && current ? (
                <>
                  {current.moveNumber}
                  {current.color === 'white' ? '.' : '…'} {current.san}
                  <span className="text-zinc-600">
                    {' '}
                    {cursor + 1}/{replay.plies.length}
                  </span>
                </>
              ) : (
                <span className="text-sky-300">
                  {standing.san}
                  <span className="text-zinc-600"> in a line</span>
                </span>
              )}
            </span>

            <NavButton onClick={() => step(1)} disabled={!forward} title="Next move" wide>
              ›
            </NavButton>
            <NavButton
              onClick={() => setMoved(mainPath(moveTree, replay.plies.length))}
              disabled={onLine && cursor >= replay.plies.length - 1}
              title="End of the game"
            >
              ⏭
            </NavButton>
            <NavButton onClick={() => setFlipped(value => !value)} title="Flip the board">
              ⇅
            </NavButton>
          </div>

          <div className="text-xs text-zinc-600 flex gap-3 flex-wrap items-center">
            {onLine && shownMove && (
              <span
                className="font-mono text-zinc-400"
                title="From White's side, the way a board shows it"
              >
                {formatEval(shownMove.cpBefore, game.color)} →{' '}
                {formatEval(shownMove.cpAfter, game.color)}
                {isFault(shownMove.tag) && (
                  <span className={markColor(shownMove.tag)}> {shownMove.tag}</span>
                )}
              </span>
            )}
            {/*
              Their move, read out of the same stored analysis. No mark beside it:
              whether a move gave something away is a judgement about whoever played
              it, and on their turn that is a statement about them.
            */}
            {onLine && !shownMove && theirMove && (
              <span
                className="font-mono text-zinc-400"
                title="What their move did, from White's side — read off the evaluations either side of it"
              >
                {formatEval(theirMove.cpBefore, game.color)} →{' '}
                {formatEval(theirMove.cpAfter, game.color)}
              </span>
            )}
            {/*
              Both readings belong to the move highlighted on the board, which has
              already been played — and on an opponent's move it is their clock, not
              yours. Unattributed numbers side by side read as being about the move
              you are looking for next.
            */}
            {onLine && current && spentByPly.has(current.index) && (
              <span>
                {current.color === game.color ? 'You' : 'Your opponent'} took{' '}
                {formatDuration(spentByPly.get(current.index) as number)} here
                {remainingByPly.has(current.index) &&
                  `, ${formatClock(remainingByPly.get(current.index) as number)} left`}
              </span>
            )}
          </div>
        </div>

        {/*
          The list is taken out of the flow from `md` up, inside a cell that has no
          height of its own. `h-full` was not enough: the row is auto-sized, so a long
          game made the list define the row and then fill it — 40 moves pushed it
          hundreds of pixels past the bottom of the board. With the list absolute, the
          board alone sets the row height and the moves scroll inside it.
        */}
        <div className="relative w-full max-w-[28rem] md:max-w-none mx-auto md:col-start-2 md:row-start-1">
          <div className="flex flex-col md:absolute md:inset-0 border border-zinc-800 rounded-xl overflow-hidden max-h-[28rem] md:max-h-none bg-zinc-900">
          <div className="px-3 py-2 border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500 shrink-0 flex items-center justify-between gap-2">
            <span>Moves</span>
            <span className="flex items-center gap-2">
              {!onLine && (
                <button
                  onClick={() => setMoved(mainPath(moveTree, path.length))}
                  title="Put the board back on the game at this point"
                  className="normal-case tracking-normal text-sky-400 hover:text-sky-200 transition-colors"
                >
                  leave the line
                </button>
              )}
              {unsavedLines && (
                <button
                  onClick={saveLines}
                  disabled={savingLines}
                  title="Keep the variations you have played out on this game"
                  className="normal-case tracking-normal text-zinc-200 hover:text-white transition-colors disabled:opacity-40"
                >
                  {savingLines ? 'saving…' : 'save lines'}
                </button>
              )}
            </span>
          </div>
          <MoveList
            plies={replay.plies}
            current={cursor}
            onBranch={!onLine}
            onPick={index => setMoved(mainPath(moveTree, index + 1))}
            tags={engineTags}
            reviewed={reviewed}
            secondsByPly={spentByPly}
            yourColor={game.color}
            tree={moveTree}
            path={path}
            onPath={setMoved}
            styleOf={styleOf}
          />
            {replay.truncated && (
              <p className="px-3 py-2 text-xs text-amber-400 border-t border-zinc-800">
                The stored move list stopped parsing part way through.
              </p>
            )}
          </div>
        </div>
      </section>

      <ReviewEditor
        userId={userId}
        game={game}
        plies={replay.plies}
        tagGroups={vocabulary}
        patternTags={patternTagList}
        onShowPly={ply => setMoved(mainPath(moveTree, ply + 1))}
        lineOnBoard={lineOnBoard}
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
