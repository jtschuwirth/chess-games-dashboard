'use client'

import { TRACKED_POOLS, ratingSeries, weekRating } from '@/lib/plan'
import type { PlanWeek, StudyPlan } from '@/types/chess'

/** `+23` / `−8` / `—`, coloured by direction. Rating is the one number where up is good. */
function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-700">—</span>

  return (
    <span
      className={
        value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-zinc-500'
      }
    >
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      {Math.abs(value)}
    </span>
  )
}

/**
 * What you were rated going into this week, and what it did since the week before.
 *
 * Editable by hand as well as filled by the button, because the games that would answer
 * it are often not in the app — a plan's first weeks usually predate the first sync, and
 * a number you typed from memory is worth more than a blank.
 */
export function WeekRatings({
  week,
  previous,
  onChange,
  onSync,
}: {
  week: PlanWeek
  /** The week before, for the change column. Null for the first one. */
  previous: PlanWeek | null
  onChange: (update: (current: PlanWeek) => PlanWeek) => void
  onSync: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Rating going in
          <span className="normal-case tracking-normal text-zinc-700">
            {' '}
            — from your last game before the week started
          </span>
        </span>
        <button
          type="button"
          onClick={onSync}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
        >
          Fill from games
        </button>
      </div>

      <div className="flex flex-col divide-y divide-zinc-800/70 border border-zinc-800 rounded-lg overflow-hidden">
        {TRACKED_POOLS.map(pool => {
          const value = weekRating(week, pool.id)
          const before = previous ? weekRating(previous, pool.id) : null
          const change = value !== null && before !== null ? value - before : null

          return (
            <div
              key={pool.id}
              className="grid grid-cols-[1fr_4.5rem_3rem] items-center gap-2 px-3 py-1.5"
            >
              <span className="text-xs text-zinc-400 truncate min-w-0">{pool.label}</span>

              <input
                type="number"
                value={value ?? ''}
                placeholder="—"
                onChange={event => {
                  const raw = event.target.value.trim()
                  const parsed = raw === '' ? null : Math.round(Number(raw))
                  const next = parsed !== null && Number.isFinite(parsed) ? parsed : null
                  onChange(current => ({
                    ...current,
                    ratings: { ...current.ratings, [pool.id]: next },
                  }))
                }}
                aria-label={`${pool.label} rating going into this week`}
                className="bg-transparent text-sm font-mono text-zinc-200 outline-none text-right tabular-nums placeholder:text-zinc-700 focus:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />

              <span className="text-xs font-mono text-right tabular-nums">
                <Change value={change} />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Each tracked rating across the whole plan, drawn rather than charted.
 *
 * One line per pool rather than all three on shared axes: 1251 and 1624 on one scale
 * flattens both into the same wiggle, and the question is "which way is each going",
 * not "which is higher". Each line is scaled to its own range, with the numbers beside
 * it, so the shape carries the trend and the figures carry the size.
 */
export function RatingProgress({ plan }: { plan: Pick<StudyPlan, 'weeks'> }) {
  const series = ratingSeries(plan)
  if (series.every(entry => entry.first === null)) return null

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-wide text-zinc-500">
        Rating through the plan
        <span className="normal-case tracking-normal text-zinc-700">
          {' '}
          — one point per week, as each began
        </span>
      </h2>

      <div className="flex flex-col gap-2">
        {series.map(entry => {
          const known = entry.points.filter((value): value is number => value !== null)
          if (known.length === 0) return null

          const low = Math.min(...known)
          const high = Math.max(...known)
          const span = high - low || 1

          return (
            <div
              key={entry.pool.id}
              className="grid grid-cols-[8rem_minmax(0,1fr)_7rem] items-center gap-3"
            >
              <span className="text-xs text-zinc-400 truncate">{entry.pool.label}</span>

              <svg
                viewBox="0 0 100 24"
                preserveAspectRatio="none"
                className="w-full h-6"
                role="img"
                aria-label={`${entry.pool.label} across ${entry.points.length} weeks`}
              >
                <path
                  d={entry.points
                    .map((value, index) =>
                      value === null
                        ? null
                        : `${(index / Math.max(1, entry.points.length - 1)) * 100},${
                            24 - ((value - low) / span) * 22 - 1
                          }`,
                    )
                    .filter((point): point is string => point !== null)
                    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point}`)
                    .join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  className="text-zinc-400"
                />
              </svg>

              <span className="text-xs font-mono text-right tabular-nums text-zinc-400">
                {entry.last ?? '—'} <Change value={entry.change} />
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
