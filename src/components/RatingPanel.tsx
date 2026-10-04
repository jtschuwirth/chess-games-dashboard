'use client'

import { useState } from 'react'
import Chip from '@/components/Chip'
import Panel from '@/components/Section'
import { formatRange, formatShortDay } from '@/lib/days'
import {
  TRACKED_POOLS,
  historyRange,
  seriesInRange,
  type PoolSeries,
  type RatingHistory,
  type TrackedPool,
} from '@/lib/rating-history'
import type { Source } from '@/types/chess'

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-700">—</span>

  return (
    <span className={value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-zinc-500'}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      {Math.abs(value)}
    </span>
  )
}

/** One pool, the full height of the panel, with its own scale. */
function Chart({ series, from, to }: { series: PoolSeries; from: number; to: number }) {
  const low = series.low ?? 0
  const high = series.high ?? 0
  const pad = Math.max(5, Math.round((high - low) * 0.08))
  const floor = low - pad
  const ceiling = high + pad
  const span = ceiling - floor || 1
  const days = Math.max(1, Math.round((to - from) / 86400000))

  const path = series.points
    .map((point, index) => {
      const x = ((point.at - from) / 86400000 / days) * 100
      const y = 100 - ((point.rating - floor) / span) * 100
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-between text-[10px] font-mono text-zinc-600 tabular-nums shrink-0 py-0.5">
        <span>{high}</span>
        <span>{low}</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-64 text-sky-400"
          role="img"
          aria-label={`${series.pool.label}, ${formatRange(from, to)}`}
        >
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>{formatShortDay(from)}</span>
          <span>{formatShortDay(to)}</span>
        </div>
      </div>
    </div>
  )
}

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
  const [picked, setPicked] = useState<string | null>(null)

  /*
    Ends on the last day the history knows rather than on today: it is the honest end of
    the data, and it keeps the clock out of render, which the purity rule forbids.
  */
  const known = historyRange(history)
  const to = known?.to ?? 0
  const start = known === null ? null : Math.max(from ?? known.from, known.from)

  const pools: TrackedPool[] =
    source === 'both' ? TRACKED_POOLS : TRACKED_POOLS.filter(pool => pool.source === source)

  const series =
    start === null ? [] : seriesInRange(history, start, to, pools).filter(e => e.points.length > 0)

  const shown = series.find(entry => entry.pool.id === picked) ?? series[0]

  return (
    <Panel
      id="rating"
      title="Rating"
      meta={start !== null && shown ? formatRange(start, to) : undefined}
      actions={
        shown ? (
          <span className="font-mono text-sm tabular-nums text-zinc-200">
            {shown.last} <Change value={shown.change} />
          </span>
        ) : undefined
      }
    >
      {!shown ? (
        <p className="text-sm text-zinc-500">
          Nothing recorded yet — this fills in as games are synced.
        </p>
      ) : (
        <>
          {series.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {series.map(entry => (
                <Chip
                  key={entry.pool.id}
                  active={entry.pool.id === shown.pool.id}
                  onClick={() => setPicked(entry.pool.id)}
                >
                  {entry.pool.label}
                </Chip>
              ))}
            </div>
          )}

          <Chart series={shown} from={start as number} to={to} />
        </>
      )}
    </Panel>
  )
}
