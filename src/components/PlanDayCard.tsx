'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import StatusTag from '@/components/StatusTag'
import { dayProgress, formatDay, isDayComplete, reviewsOn } from '@/lib/plan'
import { trainableMistakes } from '@/lib/review'
import type { GameRecord, PlanDay } from '@/types/chess'

/** How long after the last keystroke a note is written. */
const NOTE_DEBOUNCE_MS = 800

/**
 * One day of a plan: what to do, whether you did it, what you thought, and what you
 * wrote up.
 *
 * The reviews are not stored on the day. The day knows its date and a review knows when
 * it was written, so they meet on the date — which means a review turns up here by
 * itself, and nothing has to be kept in step when the plan is edited or a game is
 * reviewed again.
 */
export default function PlanDayCard({
  index,
  day,
  date,
  isToday,
  games,
  onChange,
}: {
  index: number
  day: PlanDay
  date: number
  isToday: boolean
  games: GameRecord[]
  /**
   * Takes a function of the current day rather than a finished day. Two boxes ticked in
   * the same React batch would otherwise both be computed from the same stale `day`
   * prop, and the second would quietly undo the first — which it did.
   */
  onChange: (update: (current: PlanDay) => PlanDay) => void
}) {
  /**
   * Decided once, on arrival: a day you have already finished starts folded, so what is
   * left to do is what you see. After that it is plain state.
   *
   * Deriving it on every render instead would read well and behave badly — ticking the
   * last box of a day would fold the card away under your hand, which is the same trap
   * the review form's tag picker fell into when it derived "open" from "has no tags yet".
   */
  const [open, setOpen] = useState(() => isToday || !isDayComplete(day))

  const [note, setNote] = useState(day.note)

  const { done, total } = dayProgress(day)
  const reviews = useMemo(() => reviewsOn(games, date), [games, date])

  /**
   * The note is written once the typing stops rather than once per keystroke. The effect
   * cancels its own timer on the next change, so holding a key never queues a write per
   * character, and it does nothing at all once the typed text and the stored text agree —
   * which is what stops the write it just made from starting another.
   */
  useEffect(() => {
    if (note === day.note) return

    const id = setTimeout(() => onChange(current => ({ ...current, note })), NOTE_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [note, day.note, onChange])

  function patchTask(taskIndex: number, change: Partial<PlanDay['tasks'][number]>) {
    onChange(current => ({
      ...current,
      tasks: current.tasks.map((task, i) => (i === taskIndex ? { ...task, ...change } : task)),
    }))
  }

  return (
    <section className="border border-zinc-800 rounded-xl bg-zinc-900">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? `Fold day ${index + 1} away` : `Open day ${index + 1}`}
          title={open ? `Fold day ${index + 1} away` : `Open day ${index + 1}`}
          className="w-5 h-5 shrink-0 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 transition-colors leading-none"
        >
          {open ? '−' : '+'}
        </button>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-baseline gap-3 flex-1 min-w-0 text-left"
        >
          <h2 className="text-sm font-semibold text-zinc-100 shrink-0">day {index + 1}</h2>
          <span className="text-xs text-zinc-500 shrink-0">{formatDay(date)}</span>
          {isToday && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shrink-0">
              today
            </span>
          )}
        </button>

        <span className="text-xs font-mono text-zinc-600 shrink-0">
          {done}/{total}
        </span>
      </div>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {/*
              The box and the text are siblings, not a text field inside a button:
              interactive content nested in a button is invalid, and it made clicking
              into the text to edit it tick the box instead.
            */}
            {day.tasks.map((task, taskIndex) => (
              <div key={taskIndex} className="flex items-center gap-2.5 group/task">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={task.done}
                  aria-label={task.text || `Task ${taskIndex + 1}`}
                  onClick={() => patchTask(taskIndex, { done: !task.done })}
                  className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px] leading-none transition-colors ${
                    task.done
                      ? 'bg-emerald-500/80 border-emerald-500/80 text-zinc-950'
                      : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {task.done ? '✓' : ''}
                </button>

                <input
                  value={task.text}
                  onChange={event => patchTask(taskIndex, { text: event.target.value })}
                  placeholder="what to do"
                  className={`flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-zinc-700 ${
                    task.done ? 'text-zinc-600 line-through' : 'text-zinc-200'
                  }`}
                />

                <button
                  type="button"
                  onClick={() =>
                    onChange(current => ({
                      ...current,
                      tasks: current.tasks.filter((_, i) => i !== taskIndex),
                    }))
                  }
                  title="Remove this task"
                  aria-label={`Remove ${task.text || 'this task'}`}
                  className="text-xs text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover/task:opacity-100 focus:opacity-100 shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                onChange(current => ({
                  ...current,
                  tasks: [...current.tasks, { text: '', done: false }],
                }))
              }
              className="self-start text-xs text-zinc-600 hover:text-zinc-300 transition-colors mt-1"
            >
              + Add a task
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Note</span>
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
              placeholder="How it went, and what to carry into tomorrow"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600 resize-y"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              Reviewed this day
              <span className="normal-case tracking-normal text-zinc-700">
                {' '}
                — found by date, nothing to link
              </span>
            </span>

            {reviews.length === 0 ? (
              <p className="text-xs text-zinc-600">
                Nothing reviewed on {formatDay(date)}.{' '}
                <Link
                  href="/dashboard"
                  className="underline decoration-zinc-700 hover:decoration-zinc-400"
                >
                  Find a game to take apart
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-zinc-800/70">
                {reviews.map(game => {
                  const tags = trainableMistakes(game.review).flatMap(entry => entry.tags)
                  return (
                    <Link
                      key={game.id}
                      href={`/games/${game.id}`}
                      className="flex items-center gap-2 py-2 text-sm hover:bg-zinc-800/50 -mx-2 px-2 rounded transition-colors"
                    >
                      <StatusTag tone="review">◆ reviewed</StatusTag>
                      <span className="text-zinc-300 truncate min-w-0">
                        {game.color === 'white' ? 'White' : 'Black'} vs {game.opponent}
                      </span>
                      {tags.length > 0 && (
                        <span className="text-xs text-zinc-600 truncate min-w-0 ml-auto">
                          {tags.join(' · ')}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
