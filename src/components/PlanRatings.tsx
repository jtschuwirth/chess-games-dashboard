'use client'

import { addDays, dayKey } from '@/lib/days'
import { dayDate, planRatingWindow } from '@/lib/plan'
import { TRACKED_POOLS, daysKnown, ratingOn, type RatingHistory } from '@/lib/rating-history'
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

/**
 * What you were rated going into a week, and what the week before did to it.
 *
 * Read straight out of the rating history rather than stored on the week or filled by a
 * button: the history already knows what you closed every day on, so a week asking to be
 * told its own rating would be asking for something the app can work out. Nothing to
 * press, and nothing that can be out of date.
 */
export function WeekRatings({
  plan,
  index,
  history,
}: {
  plan: StudyPlan
  index: number
  history: RatingHistory
}) {
  /** Going in means the close of the day before day one. */
  const closeBefore = (weekIndex: number) =>
    dayKey(addDays(dayDate(plan, weekIndex, 0), -1))

  const rows = TRACKED_POOLS.map(pool => {
    const now = ratingOn(history, pool.id, closeBefore(index))
    const before = index > 0 ? ratingOn(history, pool.id, closeBefore(index - 1)) : null

    return { pool, now, change: now !== null && before !== null ? now - before : null }
  })

  if (rows.every(row => row.now === null)) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        Rating going in
      </span>

      <div className="flex flex-col divide-y divide-zinc-800/70 border border-zinc-800 rounded-lg overflow-hidden">
        {rows.map(row => (
          <div
            key={row.pool.id}
            className="grid grid-cols-[1fr_4.5rem_3rem] items-center gap-2 px-3 py-1.5"
          >
            <span className="text-xs text-zinc-400 truncate min-w-0">{row.pool.label}</span>
            <span className="text-sm font-mono text-zinc-200 text-right tabular-nums">
              {row.now ?? <span className="text-zinc-700">—</span>}
            </span>
            <span className="text-xs font-mono text-right tabular-nums">
              <Change value={row.change} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * What the plan has been worth: your rating going into it, against where it stands now.
 *
 * "Now" stops at the plan's own last day once that day is behind you — a plan that ran in
 * March answers for March, not for everything you have played since. While it is still
 * running, the second figure is simply your rating today.
 *
 * Today is read as the last day the history knows rather than from the clock: `ratingOn`
 * carries the last close forward, so the two give the same answer, and the history's own
 * end keeps `Date.now()` out of a render.
 */
export function PlanRatings({ plan, history }: { plan: StudyPlan; history: RatingHistory }) {
  const days = daysKnown(history)
  const window = planRatingWindow(plan, days[days.length - 1])
  if (!window) return null

  const rows = TRACKED_POOLS.map(pool => {
    const start = ratingOn(history, pool.id, window.start)
    const end = ratingOn(history, pool.id, window.end)

    return { pool, start, end, change: start !== null && end !== null ? end - start : null }
  })

  if (rows.every(row => row.start === null && row.end === null)) return null

  const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_4rem_4rem_3.5rem] gap-2 items-center'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
      <h3 className="text-xs uppercase tracking-wide text-zinc-500">Rating</h3>

      <div className="flex flex-col divide-y divide-zinc-800/70">
        <div className={`${COLUMNS} pb-1.5 text-[10px] uppercase tracking-wide text-zinc-600`}>
          <span />
          <span className="text-right">Start</span>
          <span className="text-right">{window.over ? 'End' : 'Now'}</span>
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
    </div>
  )
}
