'use client'

import { FoldButton, useFolded } from '@/components/Section'
import { formatShortDay } from '@/lib/days'
import {
  TRACKED_POOLS,
  historyRange,
  seriesInRange,
  type PoolSeries,
  type RatingHistory,
  type TrackedPool,
} from '@/lib/rating-history'
import type { Source } from '@/types/chess'

/** One colour per pool, clear of the red and amber a mistake is written in. */
const LINE: Record<string, string> = {
  'chesscom:rapid': 'text-sky-400',
  'chesscom:blitz': 'text-violet-400',
  'lichess:classical': 'text-emerald-400',
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-700">—</span>

  return (
    <span className={value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-zinc-500'}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      {Math.abs(value)}
    </span>
  )
}

/**
 * One pool's line, scaled to its own range.
 *
 * Not one chart with three lines on shared axes: rapid at 1690 and blitz at 1244 are 450
 * points apart, so a scale that holds both flattens each pool's own 100-point swing into
 * a nearly straight line — which is the whole thing you came to look at. The x axis is
 * shared, so the rows still line up in time; only the vertical is each pool's own, and
 * the figures beside it carry the size.
 */
function PoolLine({ series, from, to }: { series: PoolSeries; from: number; to: number }) {
  const low = series.low ?? 0
  const high = series.high ?? 0
  const pad = Math.max(4, Math.round((high - low) * 0.15))
  const floor = low - pad
  const span = high + pad - floor || 1
  const days = Math.max(1, Math.round((to - from) / 86400000))

  const path = series.points
    .map((point, index) => {
      const x = ((point.at - from) / 86400000 / days) * 100
      const y = 24 - ((point.rating - floor) / span) * 24
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_7rem] items-center gap-3">
      <span className="flex items-center gap-2 min-w-0">
        <span
          className={`w-3 h-0.5 rounded-full shrink-0 bg-current ${
            LINE[series.pool.id] ?? 'text-zinc-400'
          }`}
        />
        <span className="text-xs text-zinc-400 truncate">{series.pool.label}</span>
      </span>

      <svg
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        className="w-full h-12"
        role="img"
        aria-label={`${series.pool.label} from ${formatShortDay(from)} to ${formatShortDay(to)}`}
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={LINE[series.pool.id] ?? 'text-zinc-400'}
        />
      </svg>

      <span className="text-xs font-mono text-right tabular-nums text-zinc-300">
        {series.last ?? '—'} <Change value={series.change} />
      </span>
    </div>
  )
}

/**
 * Your rating over the slice the dashboard is showing.
 *
 * It follows the date window and the site, and nothing else — and says so. A rating is
 * not a property of a slice of games: there is no such thing as your rating "in the
 * Caro-Kann as Black", so letting the opening or colour filters appear to narrow it
 * would be inventing a number. The date window and the site are the two that genuinely
 * apply, because they pick *when* and *which pools*.
 */
export default function RatingPanel({
  history,
  from,
  source,
}: {
  history: RatingHistory
  /** The filtered window's start, or null for everything the history knows. */
  from: number | null
  source: Source | 'both'
}) {
  const [folded, toggle] = useFolded('rating')

  /*
    The chart ends on the last day the history knows about rather than on today. It is
    the honest end of the data, and it keeps the clock out of render — reading `Date.now`
    there is impure and the lint rule says so.
  */
  const known = historyRange(history)
  const to = known?.to ?? 0
  const start = known === null ? null : Math.max(from ?? known.from, known.from)
  const pools: TrackedPool[] =
    source === 'both' ? TRACKED_POOLS : TRACKED_POOLS.filter(pool => pool.source === source)

  const series =
    start === null ? [] : seriesInRange(history, start, to, pools).filter(e => e.points.length > 0)

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500 flex items-center gap-2">
          <FoldButton folded={folded} onToggle={toggle} label="the rating chart" />
          Rating
        </h2>
        {start !== null && series.length > 0 && (
          <span className="text-xs text-zinc-600">
            {formatShortDay(start)} – {formatShortDay(to)}
          </span>
        )}
      </div>

      {!folded &&
        (series.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing recorded yet. Your rating at the close of each day is written as games are
            synced, so this fills in from your next sync onward.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {series.map(entry => (
                <PoolLine key={entry.pool.id} series={entry} from={start as number} to={to} />
              ))}
            </div>

            <p className="text-xs text-zinc-600">
              Each line is scaled to its own range, so the shape is that rating&apos;s movement
              rather than how it compares with the others.
            </p>
            <p className="text-xs text-zinc-600">
              Follows the date window and the site. Nothing else here can narrow a rating —
              there is no such thing as your rating in one opening, or as Black.
            </p>
          </>
        ))}
    </section>
  )
}
