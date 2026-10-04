'use client'

import { addDays, dayKey } from '@/lib/days'
import { dayDate } from '@/lib/plan'
import { TRACKED_POOLS, ratingOn, type RatingHistory } from '@/lib/rating-history'
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
