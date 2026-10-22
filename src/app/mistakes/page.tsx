'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  HELD_BANDS,
  NO_MISTAKE_FILTER,
  STOOD_IN,
  heldBandOf,
  exceptSquares,
  PIECES,
  PIECE_LABEL,
  activeMarks,
  countBy,
  markTint,
  matchesMistake,
  mistakeRows,
  moveTotals,
  readCount,
  type MistakeFilter,
  type Piece,
} from '@/lib/mistakes'
import { buildOpeningTree, findPath, flattenTree } from '@/lib/opening'
import { patternTags } from '@/lib/pattern'
import { formatEval, markColor } from '@/lib/review'
import {
  BREADTH_LABEL,
  STANDING_BADGE,
  STANDING_INK,
  STANDING_LABEL,
  VERDICT_LABEL,
  breadthOf,
  imbalanceAt,
  materialGlyphs,
  materialLabel,
  standingOf,
  verdictHint,
} from '@/lib/verdict'
import PieceSprites, { spriteId } from '@/components/PieceSprites'
import type { Standing } from '@/lib/bands'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import type { Color, GameRecord, OpeningLine, PatternRecord } from '@/types/chess'
import type { MistakeRow } from '@/lib/mistakes'

/** How many rows before the list becomes a page you scroll rather than read. */
const PAGE_SIZE = 60

/**
 * One chip of a filter row: what pressing it would give you, over what that is out of.
 *
 * The first number is marked moves and is measured before this page's own filters, so
 * each chip says what it would give you rather than zero — the patterns finder's rule.
 * The second is **every analysed move of yours in the same bucket**, and without it the
 * first cannot be compared with its neighbour: 5 marked moves after a five-minute think
 * against 506 after a think under five seconds reads as a damning fact about fast moves
 * and is mostly a fact about how rarely anyone thinks for five minutes. The share is
 * what carries, and it is on the chip itself rather than a panel away, because the chip
 * is where the comparison is being made.
 *
 * A bucket with moves in it but nothing marked is the most useful chip on the row — it
 * is a thing you do and never go wrong at — so it is still legible while being
 * unpressable, rather than faded to the 30% an empty one used to get.
 */
function FilterChip({
  label,
  count,
  total,
  on,
  onClick,
  describe,
}: {
  label: ReactNode
  count: number
  /** Every analysed move in the same bucket. Left out where every chip shares one. */
  total?: number
  on: boolean
  onClick: () => void
  /** What the bucket is, for the title: "moves you spent over 5m on". */
  describe: string
}) {
  const share = total ? Math.round((count / total) * 1000) / 10 : null

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      title={
        share === null
          ? describe
          : `${count} of ${total} ${describe} are marked — ${share}%`
      }
      className={`px-3 py-1 text-xs rounded-full border transition-colors disabled:opacity-50 disabled:cursor-default ${
        on
          ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
      }`}
    >
      {label}{' '}
      <span className={on ? 'text-zinc-600' : 'text-zinc-500'}>{count}</span>
      {total !== undefined && (
        <span className={on ? 'text-zinc-500' : 'text-zinc-700'}>/{total}</span>
      )}
    </button>
  )
}

/**
 * The piece that moved, drawn the way the board draws it.
 *
 * The figurines were Unicode — `♟♞♝` — which is the trap the board itself hit and wrote
 * down: one font renders them as outlines, another as solid blocks, and at the size a row
 * wants them they are a smudge. These are the same Cburnett symbols every board on the
 * site uses, referenced by `<use>`, so a knight is the knight you have been looking at all
 * along and it scales without a font size per breakpoint.
 *
 * In **your** colour, which the text version could not say: a solid black pawn on a row
 * about a game you played as White was quietly wrong about the position.
 */
function PieceIcon({ piece, color, size = 'w-7 h-7' }: { piece: Piece; color: Color; size?: string }) {
  return (
    <svg
      viewBox="0 0 45 45"
      className={`${size} shrink-0`}
      role="img"
      aria-label={`${color} ${PIECE_LABEL[piece].toLowerCase()}`}
    >
      <use href={`#${spriteId(piece, color)}`} />
    </svg>
  )
}

/**
 * What the second pass made of one marked move, on the row it belongs to.
 *
 * The same three things the game view shows and in the same words, because a descriptor
 * that reads one way in a list and another on the game it came from is two vocabularies:
 * the name of the fall, coloured by the band it fell FROM, then the fall itself and how
 * many of the engine's candidates held — which is the part that says whether there was a
 * line to find or whether anything reasonable would have done.
 *
 * Nothing is drawn for a move the pass has not read, rather than a placeholder: the
 * panel's own heading says how many of those there are, which is the honest place for it.
 */
function Reading({ row }: { row: MistakeRow }) {
  if (!row.verdict) return <span />

  const from = standingOf(row.cpBefore)
  const to = standingOf(row.cpAfter)
  const breadth = breadthOf(row.verdict.holds, row.verdict.looked)
  const imbalance = imbalanceAt(row.verdict)

  return (
    /* below lg the row keeps the move, the square, the evaluation and the clock: a
       descriptor truncated to two characters is noise where those are still the point */
    <span className="hidden lg:flex items-center gap-2 min-w-0 flex-1">
      <span
        title={verdictHint(from, to, breadth)}
        className={`min-w-0 truncate text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${STANDING_BADGE[from]}`}
      >
        {VERDICT_LABEL[row.verdict.verdict]}
      </span>

      {/*
        Where it landed and how many held. Where it started is its own column now, so
        printing `winning → level` here would be the same word twice on one row.
      */}
      <span
        className="hidden xl:inline text-[11px] text-zinc-600 whitespace-nowrap"
        title={`${STANDING_LABEL[from]} → ${STANDING_LABEL[to]}, ${BREADTH_LABEL[breadth]}`}
      >
        → {STANDING_LABEL[to]} · {row.verdict.holds}/{row.verdict.looked} held
      </span>

      {imbalance && (
        <span
          className="hidden lg:inline text-[11px] text-zinc-500 whitespace-nowrap"
          title={materialLabel(imbalance)}
        >
          {materialGlyphs(imbalance)}
        </span>
      )}
    </span>
  )
}

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
  /*
   * The board is the control that sets the square filter, so it is drawn with that one
   * left off — picking e5 must not leave a board with e5 on it and nothing else to pick.
   * Every other filter still narrows it, which is what makes "where do my queen blunders
   * land" a board worth choosing from.
   */
  const heatRows = useMemo(
    () => all.filter(row => matchesMistake(row, exceptSquares(mistakeFilter))),
    [all, mistakeFilter],
  )

  const marks = useMemo(() => activeMarks(), [])
  const byMark = useMemo(() => countBy(all, row => row.tag), [all])
  const byPiece = useMemo(() => countBy(all, row => row.piece), [all])
  const byPhase = useMemo(() => countBy(all, row => row.phase ?? ''), [all])
  const byThink = useMemo(() => countBy(all, row => row.thinkBand ?? ''), [all])
  /* the chip counts what the board that picked it was showing, not what it left behind */
  const bySquare = useMemo(() => countBy(heatRows, row => row.square), [heatRows])
  const byStood = useMemo(() => countBy(all, row => row.stood), [all])
  const byHeld = useMemo(
    () => countBy(all, row => heldBandOf(row.verdict?.holds ?? null) ?? ''),
    [all],
  )
  /*
   * The denominator, over the same games the rows come from. It is the moves where
   * nothing went wrong, which is 93% of them, and it is what turns "5 marked" into
   * "5 of 118".
   */
  const totals = useMemo(() => moveTotals(scoped), [scoped])
  /* what the second pass has been over, which a column drawn from it has to say */
  const read = useMemo(() => readCount(rows), [rows])
  /* the held row's own coverage: against the slice, not against what it has narrowed to */
  const readAll = useMemo(() => readCount(all), [all])

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

  const toggleStood = (stood: Standing) =>
    setMistakeFilter(current => ({
      ...current,
      stood: current.stood.includes(stood)
        ? current.stood.filter(entry => entry !== stood)
        : [...current.stood, stood],
    }))

  const toggleHeld = (label: string) =>
    setMistakeFilter(current => ({
      ...current,
      held: current.held.includes(label)
        ? current.held.filter(entry => entry !== label)
        : [...current.held, label],
    }))

  const toggleSquare = (square: string) =>
    setMistakeFilter(current => ({
      ...current,
      squares: current.squares.includes(square)
        ? current.squares.filter(entry => entry !== square)
        : [...current.squares, square],
    }))

  const anyMistakeFilter =
    mistakeFilter.marks.length > 0 ||
    mistakeFilter.pieces.length > 0 ||
    mistakeFilter.phases.length > 0 ||
    mistakeFilter.think.length > 0 ||
    mistakeFilter.squares.length > 0 ||
    mistakeFilter.stood.length > 0 ||
    mistakeFilter.held.length > 0

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
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                Mark
                <span className="normal-case tracking-normal text-zinc-600">
                  {' '}
                  — {all.length} of {totals.moves} of your moves
                </span>
                {totals.stale > 0 && (
                  <span
                    className="normal-case tracking-normal text-amber-500/80"
                    title="A shallower engine finds fewer faults and scores them smaller, so every share below reads low. The Engine filter can take them out."
                  >
                    {' '}
                    · {totals.stale} analysed by an older build
                  </span>
                )}
              </span>
              {/* no per-chip total: every mark shares the one denominator above */}
              <div className="flex gap-1.5 flex-wrap">
                {marks.map(mark => (
                  <FilterChip
                    key={mark}
                    label={<span className="font-mono">{mark}</span>}
                    count={byMark.get(mark) ?? 0}
                    on={mistakeFilter.marks.includes(mark)}
                    onClick={() => toggleMark(mark)}
                    describe={`moves marked ${mark}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Piece moved</span>
              <div className="flex gap-1.5 flex-wrap">
                {PIECES.map(piece => (
                  <FilterChip
                    key={piece}
                    /* the board's own symbol, in white: the chip sits on a dark pill */
                    label={<PieceIcon piece={piece} color="white" size="w-4 h-4" />}
                    count={byPiece.get(piece) ?? 0}
                    total={totals.byPiece.get(piece) ?? 0}
                    on={mistakeFilter.pieces.includes(piece)}
                    onClick={() => togglePiece(piece)}
                    describe={`${PIECE_LABEL[piece].toLowerCase()} moves`}
                  />
                ))}
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
                {gamePhases().map(phase => (
                  <FilterChip
                    key={phase.label}
                    label={<span className="font-mono">{phase.label}</span>}
                    count={byPhase.get(phase.label) ?? 0}
                    total={totals.byPhase.get(phase.label) ?? 0}
                    on={mistakeFilter.phases.includes(phase.label)}
                    onClick={() => togglePhase(phase.label)}
                    describe={`${phase.name.toLowerCase()} moves`}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                <span title="Seconds you spent on the move itself, read off the game's own clock readings">
                  Thought for
                </span>
                {totals.timed < totals.moves && (
                  <span className="normal-case tracking-normal text-zinc-600">
                    {' '}
                    — {totals.timed} of {totals.moves} moves are timed
                  </span>
                )}
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {THINK_BANDS.map(band => (
                  <FilterChip
                    key={band.label}
                    label={band.label}
                    count={byThink.get(band.label) ?? 0}
                    total={totals.byThink.get(band.label) ?? 0}
                    on={mistakeFilter.think.includes(band.label)}
                    onClick={() => toggleThink(band.label)}
                    describe={`moves you spent ${band.label} on`}
                  />
                ))}
              </div>
            </div>


            <div className="flex flex-col gap-1.5">
              <span
                className="text-xs uppercase tracking-wide text-zinc-500"
                title="The band you were in before you played it. A band's share is partly its own geometry: the mark is defined as falling OUT of the band you were in, so a narrow band marks more than a wide one whoever is playing — winning and losing have no ceiling or floor to fall through."
              >
                Where you stood
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {STOOD_IN.map(stood => (
                  <FilterChip
                    key={stood}
                    /*
                      Plain ink, not the badge. A chip is already a bordered pill and the
                      badge is another, which at 10px uppercase was two borders round one
                      word — and on an active chip, which is light, the badge's own
                      translucent background and pale text very nearly vanish. The hue is
                      the badge's, so a chip and the rows it filters to still match.
                    */
                    label={
                      <span
                        className={`uppercase tracking-wide text-[11px] font-medium ${
                          mistakeFilter.stood.includes(stood) ? '' : STANDING_INK[stood]
                        }`}
                      >
                        {STANDING_LABEL[stood]}
                      </span>
                    }
                    count={byStood.get(stood) ?? 0}
                    total={totals.byStood.get(stood) ?? 0}
                    on={mistakeFilter.stood.includes(stood)}
                    onClick={() => toggleStood(stood)}
                    describe={`moves played from ${STANDING_LABEL[stood]}`}
                  />
                ))}
              </div>
            </div>


            <div className="flex flex-col gap-1.5">
              <span
                className="text-xs uppercase tracking-wide text-zinc-500"
                title="How many of the five moves the engine looked at would not have been a mistake. One or two is a line to find; five is a position that forgave anything."
              >
                Moves that held
                {readAll < all.length && (
                  <span className="normal-case tracking-normal text-zinc-600">
                    {' '}
                    — {readAll} of {all.length} read
                  </span>
                )}
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {HELD_BANDS.map(band => (
                  <FilterChip
                    key={band.label}
                    label={<span className="font-mono">{band.label}</span>}
                    count={byHeld.get(band.label) ?? 0}
                    on={mistakeFilter.held.includes(band.label)}
                    onClick={() => toggleHeld(band.label)}
                    describe={`moves where ${band.label} of the engine's candidates held`}
                  />
                ))}
                {anyMistakeFilter && mistakeFilter.squares.length === 0 && (
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

            {/*
              Only once a square is picked. Sixty-four chips would be a board drawn badly,
              and the board itself is upstairs doing that job — this row is the record of
              what it chose, where everything else active is already listed.
            */}
            {mistakeFilter.squares.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span
                  className="text-xs uppercase tracking-wide text-zinc-500"
                  title="Picked off the board below"
                >
                  Square
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {mistakeFilter.squares.map(square => (
                    <button
                      key={square}
                      type="button"
                      onClick={() => toggleSquare(square)}
                      title={`Stop showing only ${square}`}
                      className="px-3 py-1 text-xs rounded-full border bg-zinc-200 text-zinc-900 border-zinc-200 font-mono transition-colors"
                    >
                      {square}{' '}
                      <span className="text-zinc-600">{bySquare.get(square) ?? 0}</span>
                      <span className="text-zinc-500"> ✕</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMistakeFilter(NO_MISTAKE_FILTER)}
                    className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        }
      />

      <MistakeHeatmap
        rows={heatRows}
        selected={mistakeFilter.squares}
        onToggle={toggleSquare}
        onClear={() => setMistakeFilter(current => ({ ...current, squares: [] }))}
      />

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
        meta={
          <span title="The second pass reads the marked moves one at a time. What it has not read carries no descriptor — Read more on the panel above.">
            {rows.length}
            {rows.length === all.length ? '' : ` of ${all.length}`}
            <span className="text-zinc-600"> · {read} read</span>
          </span>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Nothing marked in this slice. Analyse some games, or widen the filters.
          </p>
        ) : (
          <>
            {/* defines the symbols every row's <use> points at; draws nothing itself */}
            <PieceSprites />

            {/* flush in the panel, like the other wide tables */}
            <div className="-mx-5 flex flex-col divide-y divide-zinc-800/70">
              {rows.slice(0, limit).map(row => (
                <Link
                  key={`${row.game.id}:${row.ply}`}
                  href={`/games/${row.game.id}${search}`}
                  /*
                    A flex row with a fixed-width cluster on the left rather than a grid:
                    the columns still line up, because each of those is a fixed width, and
                    what wants to disappear at a narrower window can simply be hidden
                    without a second grid template to keep in step with the first.

                    The order is what you are scanning for. The piece and the move say
                    WHAT, the evaluation says what it cost, the clock says how long you
                    took over it and the band says where you were standing — those five
                    are the row. Who you were playing and when are how you find the game
                    again afterwards, so they go right, small, and out of the way.
                  */
                  className="flex items-center gap-3 px-5 py-2 hover:bg-zinc-800/50 transition-colors"
                >
                  <PieceIcon piece={row.piece} color={row.game.color} />

                  <span className="font-mono text-sm text-zinc-200 whitespace-nowrap w-[6.5rem] shrink-0">
                    {row.moveNumber}
                    {row.game.color === 'white' ? '.' : '…'} {row.san}
                    <span className={markColor(row.tag)}>{row.tag}</span>
                  </span>

                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded text-center w-9 shrink-0"
                    style={{ background: `${markTint(row.tag)}22`, color: markTint(row.tag) }}
                    title={`Landed on ${row.square}`}
                  >
                    {row.square}
                  </span>

                  {/* what it cost, which is the figure the row is about */}
                  <span className="font-mono text-sm tabular-nums whitespace-nowrap w-[7rem] shrink-0">
                    <span className="text-zinc-400">
                      {formatEval(row.cpBefore, row.game.color)}
                    </span>
                    <span className="text-zinc-600"> → </span>
                    <span className={markColor(row.tag)}>
                      {formatEval(row.cpAfter, row.game.color)}
                    </span>
                  </span>

                  {/* and how long you took over it */}
                  <span
                    className="hidden sm:block text-sm tabular-nums text-zinc-400 whitespace-nowrap w-[4.5rem] shrink-0"
                    title="Time spent on this move"
                  >
                    {row.think === null ? '—' : formatDuration(row.think)}
                  </span>

                  <span
                    className={`hidden md:block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border text-center w-[4.75rem] shrink-0 ${STANDING_BADGE[row.stood]}`}
                    title={`You were ${STANDING_LABEL[row.stood]} before this move`}
                  >
                    {STANDING_LABEL[row.stood]}
                  </span>

                  <Reading row={row} />

                  <span className="hidden sm:block ml-auto text-xs text-zinc-600 min-w-0 truncate text-right">
                    vs {row.game.opponent}
                    <span className="text-zinc-700">
                      {' '}
                      · {new Date(row.game.playedAt).toLocaleDateString()}
                    </span>
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
