'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AccuracyPanel from '@/components/AccuracyPanel'
import FilterPanel, { FilterGroup, FilterRow } from '@/components/FilterPanel'
import Chip from '@/components/Chip'
import MistakeHeatmap from '@/components/MistakeHeatmap'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import ReviewPanel from '@/components/ReviewPanel'
import VerdictPanel from '@/components/VerdictPanel'
import { THINK_BANDS } from '@/lib/accuracy'
import { formatDuration, gamePhases, timeControlsIn } from '@/lib/clocks'
import {
  DEFAULT_FILTERS,
  ALL_OPENINGS,
  UNCLASSIFIED_OPENING,
  readFilters,
  writeFilters,
  type Filters,
} from '@/lib/dashboard-filters'
import { getGames, getOpenings, getPatterns } from '@/lib/firestore'
import {
  BREADTHS_IN,
  NO_MISTAKE_FILTER,
  STOOD_IN,
  breadthOfRow,
  except,
  exceptSquares,
  PIECES,
  PIECE_LABEL,
  activeMarks,
  countBy,
  markTint,
  matchesMistake,
  mistakeRows,
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
import type { Breadth, Standing } from '@/lib/bands'
import { arrivalCounts, positionKeyMap, scopeGames } from '@/lib/scope'
import type { Color, GameRecord, OpeningLine, PatternRecord } from '@/types/chess'
import type { MistakeRow } from '@/lib/mistakes'

/** How many rows before the list becomes a page you scroll rather than read. */
const PAGE_SIZE = 60


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
  /** The Arrival chips' counts — null, and the row hidden, until a line is picked. */
  const arrivals = useMemo(
    () => arrivalCounts(games ?? [], tree, positionKeys, filters),
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

  /*
   * Each row is counted with the OTHER rows in force but not its own, which is the rule
   * the patterns finder follows and the one this page was breaking: counting against the
   * whole slice meant a chip went on claiming 506 after you had narrowed to 122, so the
   * moment two filters were on every number on screen was about a slice nobody was
   * looking at. They are not drawn any more — seven rows of fractions was the noise — but
   * they still decide which chips have nothing behind them, and they have to be right to
   * do that.
   */
  const countsFor = useCallback(
    (key: keyof MistakeFilter) => all.filter(row => matchesMistake(row, except(mistakeFilter, key))),
    [all, mistakeFilter],
  )
  const byMark = useMemo(() => countBy(countsFor('marks'), row => row.tag), [countsFor])
  const byPiece = useMemo(() => countBy(countsFor('pieces'), row => row.piece), [countsFor])
  const byPhase = useMemo(() => countBy(countsFor('phases'), row => row.phase ?? ''), [countsFor])
  const byThink = useMemo(
    () => countBy(countsFor('think'), row => row.thinkBand ?? ''),
    [countsFor],
  )
  const byStood = useMemo(() => countBy(countsFor('stood'), row => row.stood), [countsFor])
  const byBreadth = useMemo(
    () => countBy(countsFor('breadth'), row => breadthOfRow(row) ?? ''),
    [countsFor],
  )
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

  const toggleBreadth = (breadth: Breadth) =>
    setMistakeFilter(current => ({
      ...current,
      breadth: current.breadth.includes(breadth)
        ? current.breadth.filter(entry => entry !== breadth)
        : [...current.breadth, breadth],
    }))

  const toggleSquare = (square: string) =>
    setMistakeFilter(current => ({
      ...current,
      squares: current.squares.includes(square)
        ? current.squares.filter(entry => entry !== square)
        : [...current.squares, square],
    }))

  /** How many of this page's own rows are narrowing, for the panel's one Reset. */
  const activeRows = [
    mistakeFilter.marks,
    mistakeFilter.pieces,
    mistakeFilter.phases,
    mistakeFilter.think,
    mistakeFilter.stood,
    mistakeFilter.breadth,
    mistakeFilter.squares,
  ].filter(row => row.length > 0).length


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
        arrivals={arrivals}
        extraActive={activeRows}
        onReset={() => {
          setFilters(DEFAULT_FILTERS)
          setMistakeFilter(NO_MISTAKE_FILTER)
        }}
        extra={
          <>
            <FilterGroup>Which moves</FilterGroup>

            <FilterRow label="Mark">
              {marks.map(mark => (
                <Chip
                  key={mark}
                  active={mistakeFilter.marks.includes(mark)}
                  onClick={() => toggleMark(mark)}
                  title={`${byMark.get(mark) ?? 0} of them`}
                >
                  <span className="font-mono">{mark}</span>
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Piece">
              {PIECES.map(piece => (
                <Chip
                  key={piece}
                  active={mistakeFilter.pieces.includes(piece)}
                  disabled={(byPiece.get(piece) ?? 0) === 0}
                  onClick={() => togglePiece(piece)}
                  title={`${PIECE_LABEL[piece]} — ${byPiece.get(piece) ?? 0}`}
                >
                  <PieceIcon piece={piece} color="white" size="w-4 h-4" />
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Played in" title="When the move was played, in your own move numbers — not how long the game lasted">
              {gamePhases().map(phase => (
                <Chip
                  key={phase.label}
                  active={mistakeFilter.phases.includes(phase.label)}
                  disabled={(byPhase.get(phase.label) ?? 0) === 0}
                  onClick={() => togglePhase(phase.label)}
                  title={`${phase.name} — ${byPhase.get(phase.label) ?? 0}`}
                >
                  <span className="font-mono">{phase.label}</span>
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Thought for" title="Seconds you spent on the move itself, read off the game's own clock readings">
              {THINK_BANDS.map(band => (
                <Chip
                  key={band.label}
                  active={mistakeFilter.think.includes(band.label)}
                  disabled={(byThink.get(band.label) ?? 0) === 0}
                  onClick={() => toggleThink(band.label)}
                  title={`${byThink.get(band.label) ?? 0} of them`}
                >
                  {band.label}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow
              label="Stood in"
              title="The band you were in before you played it — the axis the verdict is named from. A band's own geometry is part of it: the mark is defined as falling OUT of the band you were in, and winning and losing have no ceiling or floor to fall through."
            >
              {STOOD_IN.map(stood => (
                <Chip
                  key={stood}
                  active={mistakeFilter.stood.includes(stood)}
                  disabled={(byStood.get(stood) ?? 0) === 0}
                  onClick={() => toggleStood(stood)}
                  title={`${byStood.get(stood) ?? 0} of them`}
                >
                  <span
                    className={
                      mistakeFilter.stood.includes(stood) ? '' : STANDING_INK[stood]
                    }
                  >
                    {STANDING_LABEL[stood]}
                  </span>
                </Chip>
              ))}
            </FilterRow>

            <FilterRow
              label="Position was"
              title="What the position asked for: sharp is a line to find, tight a few playable moves, stable one that forgave anything. Only the moves the second pass has read carry this."
            >
              {BREADTHS_IN.map(breadth => (
                <Chip
                  key={breadth}
                  active={mistakeFilter.breadth.includes(breadth)}
                  disabled={(byBreadth.get(breadth) ?? 0) === 0}
                  onClick={() => toggleBreadth(breadth)}
                  title={`${BREADTH_LABEL[breadth]} — ${byBreadth.get(breadth) ?? 0}`}
                >
                  {breadth}
                </Chip>
              ))}
              {readAll < all.length && (
                <span className="text-[11px] text-zinc-600">
                  {readAll} of {all.length} read
                </span>
              )}
            </FilterRow>

            {/*
              Only once a square is picked. Sixty-four chips would be a board drawn badly,
              and the board itself is downstairs doing that job — this row is the record of
              what it chose, where everything else active is already listed.
            */}
            {mistakeFilter.squares.length > 0 && (
              <FilterRow label="Square" title="Picked off the board below">
                {mistakeFilter.squares.map(square => (
                  <Chip
                    key={square}
                    active
                    onClick={() => toggleSquare(square)}
                    title={`Stop showing only ${square}`}
                  >
                    <span className="font-mono">{square}</span>
                    <span className="text-zinc-500"> ✕</span>
                  </Chip>
                ))}
              </FilterRow>
            )}
          </>
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
