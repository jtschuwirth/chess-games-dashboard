'use client'

import { useState } from 'react'
import PlanDayCard from '@/components/PlanDayCard'
import { WeekRatings } from '@/components/PlanRatings'
import {
  dayDate,
  ratingsAt,
  weekLabel,
  weekProgress,
  weekRange,
  type PlanPosition,
} from '@/lib/plan'
import type { GameRecord, PlanWeek, StudyPlan } from '@/types/chess'

/**
 * A week of a plan, folded away unless it is the one you are in.
 *
 * A plan runs for months, so showing every day of every week at once is a page you have
 * to scroll past rather than read. Which week opens is decided once on arrival, in a
 * lazy initialiser: deriving it on every render would fold a week shut the moment you
 * finished it, the way the review form's tag picker once closed on the first tag.
 */
export default function PlanWeekCard({
  plan,
  index,
  games,
  today,
  startOpen,
  onChange,
  onRemove,
}: {
  plan: StudyPlan
  index: number
  games: GameRecord[]
  /** Where today sits in the plan, so the right day is badged. Null when it is outside. */
  today: PlanPosition | null
  /** Whether this is the week to open on arrival — today's, or the first unfinished one. */
  startOpen: boolean
  onChange: (update: (current: PlanWeek) => PlanWeek) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(startOpen)

  const week = plan.weeks[index]
  const { done, total } = weekProgress(week)
  const label = weekLabel(week, index)

  return (
    <section className="border border-zinc-800 rounded-xl bg-zinc-950/40">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? `Fold ${label} away` : `Open ${label}`}
          title={open ? `Fold ${label} away` : `Open ${label}`}
          className="w-5 h-5 shrink-0 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 transition-colors leading-none"
        >
          {open ? '−' : '+'}
        </button>

        <input
          value={week.name}
          onChange={event => onChange(current => ({ ...current, name: event.target.value }))}
          placeholder={`week ${index + 1}`}
          aria-label={`Name for ${label}`}
          className="bg-transparent outline-none text-sm font-semibold text-zinc-100 placeholder:text-zinc-100/90 min-w-0 w-36 focus:text-white"
        />

        <span className="text-xs text-zinc-500 shrink-0">{weekRange(plan, index)}</span>

        <span className="ml-auto flex items-center gap-3 shrink-0">
          <span className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden hidden sm:block">
            <span
              className="block h-full bg-emerald-500/70 rounded-full"
              style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }}
            />
          </span>
          <span className="text-xs font-mono text-zinc-600 tabular-nums">
            {done}/{total}
          </span>
          <button
            type="button"
            onClick={onRemove}
            title={`Remove ${label}`}
            aria-label={`Remove ${label}`}
            className="text-xs text-zinc-700 hover:text-red-400 transition-colors"
          >
            ✕
          </button>
        </span>
      </div>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          <WeekRatings
            week={week}
            previous={index > 0 ? plan.weeks[index - 1] : null}
            onChange={onChange}
            onSync={() =>
              onChange(current => ({
                ...current,
                // the rating going in is the one after your last game before day one
                ratings: ratingsAt(games, dayDate(plan, index, 0)),
              }))
            }
          />

          {week.days.map((day, dayIndex) => (
            <PlanDayCard
              key={dayIndex}
              index={dayIndex}
              day={day}
              date={dayDate(plan, index, dayIndex)}
              isToday={today?.week === index && today.day === dayIndex}
              games={games}
              onChange={update =>
                onChange(current => ({
                  ...current,
                  days: current.days.map((entry, i) => (i === dayIndex ? update(entry) : entry)),
                }))
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
