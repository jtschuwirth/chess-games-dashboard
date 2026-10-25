'use client'

import Link from 'next/link'
import Chip from '@/components/Chip'
import Panel from '@/components/Section'
import { gamePhases } from '@/lib/clocks'
import {
  ALL_OPENINGS,
  DEFAULT_FILTERS,
  UNCLASSIFIED_OPENING,
  type Filters,
} from '@/lib/dashboard-filters'
import { SINCE_OPTIONS } from '@/lib/game-filters'
import { openingLabel } from '@/lib/opening'
import { ARC_LABEL, gameNames } from '@/lib/shape'
import { tagName } from '@/lib/tags'
import { SOURCE_LABEL, type Color, type GameRecord, type OpeningLine, type Source } from '@/types/chess'
import type { OpeningNode } from '@/lib/opening'

/** Toggling one value in an array of them, which is every multi-select row here. */
function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

const SHAPE_OPTIONS = gameNames()

const SOURCE_OPTIONS: { value: Source | 'both'; label: string }[] = [
  { value: 'both', label: 'both' },
  { value: 'chesscom', label: SOURCE_LABEL.chesscom },
  { value: 'lichess', label: SOURCE_LABEL.lichess },
  { value: 'upload', label: SOURCE_LABEL.upload },
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

function FilterLabel({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="text-xs uppercase tracking-wide text-zinc-500 sm:pt-1.5 sm:text-right"
    >
      {children}
    </span>
  )
}

/**
 * One row of the filter: its name on the left, its control on the right.
 *
 * Exported because the rows a page adds have to be rows of the *same* grid, not a second
 * stack underneath it. They were their own `flex flex-col` with their own labels, which
 * is how a panel of ten tidy rows came to end in seven that lined up with nothing — the
 * complaint was that it read as a pile of buttons, and that is why.
 */
export function FilterRow({
  label,
  title,
  children,
}: {
  label: string
  /** What the row means, where the name cannot say it. */
  title?: string
  children: React.ReactNode
}) {
  return (
    <>
      <FilterLabel title={title}>{label}</FilterLabel>
      <div className="flex gap-1.5 flex-wrap items-center min-w-0">{children}</div>
    </>
  )
}

/**
 * A heading over a run of rows, spanning both columns.
 *
 * Seventeen rows is a wall whatever you do to them; two groups of eight with a name over
 * each is a thing you can look through. The split is real rather than decorative: the
 * first group narrows which **games** are in the slice, the second narrows which **moves**
 * of those games you are reading.
 */
export function FilterGroup({ children }: { children: React.ReactNode }) {
  return (
    <span className="sm:col-span-2 text-[10px] uppercase tracking-[0.12em] text-zinc-600 border-t border-zinc-800 pt-3 mt-1 first:border-0 first:pt-0 first:mt-0">
      {children}
    </span>
  )
}

/**
 * The table the rows sit in: one track for the names, one for the controls.
 *
 * Exported for the page that filters something other than a slice of games — the
 * patterns finder narrows write-ups and has no use for a single one of the rows below,
 * but it is the same control doing the same job and must not be a second answer to how
 * wide a label column is.
 */
export function FilterGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[7rem_1fr] gap-x-4 gap-y-2.5 items-start">{children}</div>
  )
}


/**
 * The one scope control, shared by every dashboard that reads a slice of your games.
 *
 * It was two hundred and sixty lines inside the games dashboard, which was fine while
 * there was one. The mistakes dashboard asks exactly the same question of exactly the
 * same games — which site, which colour, which clock, which window — and a second copy
 * would be a second place for "1 week" to stop meaning seven days. The panel keeps its
 * own id, so each page remembers independently whether it is folded.
 */
export default function FilterPanel({
  filters,
  setFilters,
  patch,
  games,
  scoped,
  allNodes,
  openings,
  availableControls,
  path,
  refresh,
  refreshing,
  extra,
  extraActive,
  onReset,
}: {
  filters: Filters
  setFilters: (next: Filters) => void
  patch: (next: Partial<Filters>) => void
  games: GameRecord[]
  scoped: GameRecord[]
  allNodes: OpeningNode[]
  openings: OpeningLine[]
  availableControls: { key: string; label: string; games: number }[]
  /** The saved-opening breadcrumb, root first, for the line currently picked. */
  path: OpeningNode[]
  refresh: () => void
  refreshing: boolean
  /** Rows a particular dashboard adds, such as the mark and piece a mistake was. */
  extra?: React.ReactNode
  /**
   * How many of the page's own rows are narrowing, and how to clear them.
   *
   * The panel knows about its own filters and nothing about a page's extra ones, so a
   * page that added rows had to grow a second Clear beside the panel's Reset — two
   * controls that both mean "stop narrowing", which is the disorganisation this row
   * system is for. The page hands these over and there is one button again.
   */
  extraActive?: number
  onReset?: () => void
}) {
  const ownActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
  const isFiltered = ownActive || (extraActive ?? 0) > 0
  const { endedIn, shape, tag, mistakes, reviewed, opening } = filters
  const { source, timeControls, color, since, minRating, maxRating } = filters
  const unclassifiedView = opening === UNCLASSIFIED_OPENING

  return (
      <Panel
        id="filters"
        title="Filters"
        meta={
          `${scoped.length} of ${games.length} games` +
          (isFiltered ? ` · narrowed` : '')
        }
        actions={
          <>
            {isFiltered && (
              <button
                onClick={() => (onReset ? onReset() : setFilters(DEFAULT_FILTERS))}
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
          </>
        }
      >
        <FilterGrid>
          {/* a heading over the only group is a line that separates nothing */}
          {extra && <FilterGroup>Which games</FilterGroup>}

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
            {gamePhases().map(phase => (
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
            <option value="stale">Analysed by an older build</option>
            <option value="blunder">Contains a blunder</option>
            <option value="mistake">Contains a mistake</option>
            <option value="clean">No blunder or mistake</option>
          </select>

          <FilterLabel>Shape</FilterLabel>
          <select
            value={shape ?? ''}
            onChange={event => patch({ shape: event.target.value || null })}
            title="Only analysed games have a shape, so this hides the ones the engine has not seen"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-600 sm:max-w-xs"
          >
            <option value="">Any shape</option>
            <optgroup label="What became of the lead">
              {SHAPE_OPTIONS.grouped.map(group => (
                <option key={group.arc} value={`arc:${group.arc}`}>
                  {ARC_LABEL[group.arc]}
                </option>
              ))}
            </optgroup>
            {SHAPE_OPTIONS.grouped.map(group => (
              <optgroup key={group.arc} label={ARC_LABEL[group.arc]}>
                {group.names.map(name => (
                  <option key={name} value={`name:${name}`}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Decided off the board">
              {SHAPE_OPTIONS.offBoard.map(name => (
                <option key={name} value={`name:${name}`}>
                  {name}
                </option>
              ))}
            </optgroup>
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
                {tagName(tag)} ✕
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
          {/*
            Rows a particular dashboard adds — the mark a mistake carried, the piece that
            moved. Inside the grid, so they are rows of the same table rather than a
            second stack with its own alignment.
          */}
          {extra}
        </FilterGrid>

        {openings.length === 0 && (
          <p className="text-xs text-zinc-500">
            <Link href="/openings" className="underline text-zinc-300">
              Save an opening
            </Link>{' '}
            to break these numbers down by line.
          </p>
        )}
      </Panel>
  )
}
