'use client'

import {
  planRatingWindow,
  weekRatingWindow,
  type PlanPosition,
  type RatingWindow,
} from '@/lib/plan'
import {
  TRACKED_POOLS,
  daysKnown,
  ratingOn,
  type RatingHistory,
  type TrackedPool,
} from '@/lib/rating-history'
import type { StudyPlan } from '@/types/chess'

/** `+23` / `−8` / `—`, coloured by direction. Rating is the one number where up is good. */
export function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-700">—</span>

  return (
    <span className={value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-zinc-500'}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      {Math.abs(value)}
    </span>
  )
}

interface Row {
  pool: TrackedPool
  start: number | null
  end: number | null
  change: number | null
}

/**
 * Each pool read at both ends of a window, or null when the history says nothing about
 * any of them — which is what keeps an empty table off the screen.
 */
function readRows(history: RatingHistory, window: RatingWindow): Row[] | null {
  const rows = TRACKED_POOLS.map(pool => {
    const start = ratingOn(history, pool.id, window.start)
    const end = ratingOn(history, pool.id, window.end)

    return { pool, start, end, change: start !== null && end !== null ? end - start : null }
  })

  return rows.some(row => row.start !== null || row.end !== null) ? rows : null
}

const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_4rem_4rem_3.5rem] gap-2 items-center'

/**
 * Where a stretch started and where it stands, one row per pool.
 *
 * The same table for the plan and for each of its weeks, because they are the same
 * question asked over different spans — and a week answering it differently from the
 * plan above it would be the kind of inconsistency you have to stop and work out.
 */
function RatingTable({ rows, over }: { rows: Row[]; over: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-zinc-800/70">
      <div className={`${COLUMNS} pb-1.5 text-[10px] uppercase tracking-wide text-zinc-600`}>
        <span />
        <span className="text-right">Start</span>
        <span className="text-right">{over ? 'End' : 'Now'}</span>
        <span />
      </div>

      {rows.map(row => (
        <div key={row.pool.id} className={`${COLUMNS} py-1.5`}>
          <span className="text-xs text-zinc-400 truncate min-w-0">{row.pool.label}</span>
          <span className="text-sm font-mono text-zinc-500 text-right tabular-nums">
            {row.start ?? <span className="text-zinc-700">—</span>}
          </span>
          <span className="text-sm font-mono text-zinc-100 text-right tabular-nums">
            {row.end ?? <span className="text-zinc-700">—</span>}
          </span>
          <span className="text-xs font-mono text-right tabular-nums">
            <Change value={row.change} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** The last day the history knows anything about, which is what "now" is read as. */
function lastKnown(history: RatingHistory): string | undefined {
  const days = daysKnown(history)
  return days[days.length - 1]
}

/**
 * What the plan has been worth: your rating going into it, against where it stands now.
 *
 * "Now" stops at the plan's own last day once that day is behind you — a plan that ran in
 * March answers for March, not for everything you have played since.
 */
export function PlanRatings({ plan, history }: { plan: StudyPlan; history: RatingHistory }) {
  const window = planRatingWindow(plan, lastKnown(history))
  const rows = window && readRows(history, window)
  if (!window || !rows) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
      <h3 className="text-xs uppercase tracking-wide text-zinc-500">Rating</h3>
      <RatingTable rows={rows} over={window.over} />
    </div>
  )
}

/**
 * The same for one week: where it started, and where it ended or stands.
 *
 * A finished week ends on its own last day, which is the close the week after it reads as
 * its start — so the weeks join up and a plan's whole movement is the sum of theirs. It
 * used to show only the figure going in and what the *previous* week had done, which made
 * every week report its neighbour's result rather than its own.
 *
 * A week that has not started yet is left out entirely. Read from the history alone it
 * would show your rating today at both ends and a change of zero, which is true and reads
 * as a measurement of something that has not happened.
 */
export function WeekRatings({
  plan,
  index,
  today,
  history,
}: {
  plan: StudyPlan
  index: number
  /** Where today sits in the plan, so a week still ahead can be told apart. */
  today: PlanPosition | null
  history: RatingHistory
}) {
  const window = today && index > today.week ? null : weekRatingWindow(plan, index, lastKnown(history))
  const rows = window && readRows(history, window)
  if (!window || !rows) return null

  return (
    <div className="border border-zinc-800 rounded-lg px-3 py-2 flex flex-col gap-1">
      <h3 className="text-xs uppercase tracking-wide text-zinc-500">Rating</h3>
      <RatingTable rows={rows} over={window.over} />
    </div>
  )
}
