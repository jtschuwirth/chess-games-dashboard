'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import StatusTag from '@/components/StatusTag'
import {
  dayProgress,
  formatDay,
  gamesOn,
  isDayComplete,
  reviewedCount,
  taskComplete,
} from '@/lib/plan'
import { hasReview } from '@/lib/review'
import type { GameRecord, GameResult, PlanDay, PlanTask } from '@/types/chess'

const RESULT_COLOR: Record<GameResult, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  draw: 'text-zinc-400',
}

const RESULT_LABEL: Record<GameResult, string> = {
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="w-5 h-5 shrink-0 flex items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200 transition-colors disabled:opacity-25 disabled:hover:border-zinc-800 leading-none text-xs"
    >
      {children}
    </button>
  )
}

/**
 * One task, which is a count rather than a tick.
 *
 * Most of what a plan asks for comes in quantities — five puzzles, two rapid games — and
 * three of five is neither done nor not done. A task of one is still an ordinary
 * checkbox, so the common case keeps its single click and the stepper only appears where
 * there is something to step through.
 *
 * The box completes or clears the whole thing and the stepper moves one at a time.
 * Having the box advance by one instead would make finishing a five-puzzle task five
 * clicks and leave no way to say "all of it, done".
 */
function TaskRow({
  task,
  onPatch,
  onRemove,
}: {
  task: PlanTask
  /**
   * A function of the current task, not a finished one. Three clicks on `+` in the same
   * React batch would otherwise all read `done` from the same render and all set it to
   * one — which is exactly what they did: three clicks moved a count from 0 to 1.
   */
  onPatch: (update: (current: PlanTask) => PlanTask) => void
  onRemove: () => void
}) {
  const complete = taskComplete(task)
  const counted = task.target > 1

  return (
    <div className="flex items-center gap-2.5 group/task">
      <button
        type="button"
        role="checkbox"
        aria-checked={complete}
        aria-label={task.text || 'Task'}
        onClick={() => onPatch(current => ({ ...current, done: taskComplete(current) ? 0 : current.target }))}
        title={counted ? (complete ? 'Clear all of them' : 'Mark them all done') : undefined}
        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px] leading-none transition-colors ${
          complete
            ? 'bg-emerald-500/80 border-emerald-500/80 text-zinc-950'
            : task.done > 0
              ? 'border-emerald-600/60 text-emerald-500/80'
              : 'border-zinc-700 hover:border-zinc-500'
        }`}
      >
        {complete ? '✓' : task.done > 0 ? '•' : ''}
      </button>

      <input
        value={task.text}
        onChange={event => {
          const text = event.target.value
          onPatch(current => ({ ...current, text }))
        }}
        placeholder="something to do"
        className={`flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-zinc-700 ${
          complete ? 'text-zinc-600 line-through' : 'text-zinc-200'
        }`}
      />

      {counted && (
        <div className="flex items-center gap-1 shrink-0">
          <StepButton
            label="One fewer done"
            onClick={() => onPatch(current => ({ ...current, done: Math.max(0, current.done - 1) }))}
            disabled={task.done === 0}
          >
            −
          </StepButton>
          <span
            className={`text-xs font-mono w-9 text-center tabular-nums ${
              complete ? 'text-emerald-400' : 'text-zinc-400'
            }`}
          >
            {task.done}/{task.target}
          </span>
          <StepButton
            label="One more done"
            onClick={() =>
              onPatch(current => ({
                ...current,
                done: Math.min(current.target, current.done + 1),
              }))
            }
            disabled={complete}
          >
            +
          </StepButton>
        </div>
      )}

      {/* how many there are of this task — muted, because it is set once and then read */}
      <label className="flex items-center gap-0.5 shrink-0" title="How many of these in a day">
        <span className="text-[10px] text-zinc-700">×</span>
        <input
          type="number"
          min={1}
          max={999}
          value={task.target}
          onChange={event => {
            const target = Math.max(1, Math.min(999, Math.round(Number(event.target.value) || 1)))
            onPatch(current => ({ ...current, target, done: Math.min(current.done, target) }))
          }}
          aria-label="How many of this task in a day"
          className="w-8 bg-transparent text-xs text-zinc-600 focus:text-zinc-200 outline-none text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </label>

      <button
        type="button"
        onClick={onRemove}
        title="Remove this task"
        aria-label="Remove this task"
        className="text-xs text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover/task:opacity-100 focus:opacity-100 shrink-0"
      >
        ✕
      </button>
    </div>
  )
}

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

  const { done, total } = dayProgress(day)
  const played = useMemo(() => gamesOn(games, date), [games, date])

  function patchTask(taskIndex: number, update: (current: PlanTask) => PlanTask) {
    onChange(current => ({
      ...current,
      tasks: current.tasks.map((task, i) => (i === taskIndex ? update(task) : task)),
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
              <TaskRow
                key={taskIndex}
                task={task}
                onPatch={update => patchTask(taskIndex, update)}
                onRemove={() =>
                  onChange(current => ({
                    ...current,
                    tasks: current.tasks.filter((_, i) => i !== taskIndex),
                  }))
                }
              />
            ))}

            <button
              type="button"
              onClick={() =>
                onChange(current => ({
                  ...current,
                  tasks: [...current.tasks, { text: '', target: 1, done: 0 }],
                }))
              }
              className="self-start text-xs text-zinc-600 hover:text-zinc-300 transition-colors mt-1"
            >
              + Add a task
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Note</span>
            {/*
              Written into the plan on every keystroke, not debounced into it. The debounce
              was there so a held key did not queue a write per character — which mattered
              when a change went straight to Firestore and does not now that it goes to a
              draft on the device. It also meant the last 800ms of typing lived nowhere but
              this textarea, so switching app mid-sentence lost it, which is the whole
              complaint.
            */}
            <textarea
              value={day.note ?? ''}
              onChange={event => {
                const note = event.target.value
                onChange(current => ({ ...current, note }))
              }}
              rows={2}
              placeholder="How it went, and what to carry into tomorrow"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600 resize-y"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span
              className="text-xs uppercase tracking-wide text-zinc-500"
              title="A day runs 6am to 6am, so a late session counts against the day it started in"
            >
              Played this day
              {played.length > 0 && (
                <span className="normal-case tracking-normal text-zinc-700">
                  {' '}
                  · {reviewedCount(played)} of {played.length} reviewed
                </span>
              )}
            </span>

            {played.length === 0 ? (
              <p className="text-xs text-zinc-600">
                Nothing played on {formatDay(date)}.{' '}
                <Link
                  href="/dashboard"
                  className="underline decoration-zinc-700 hover:decoration-zinc-400"
                >
                  Sync your games
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-zinc-800/70">
                {/*
                  No tags here. They are the whole point of the game view and they ran to
                  nine on one game, which squeezed the opponent's name out of the row and
                  carried the review pill off the edge of the card. The row answers "what
                  did I play today", and the class says more at a glance than the control:
                  "blitz" lands where "180+2" has to be decoded.
                */}
                {played.map(game => (
                  <Link
                    key={game.id}
                    href={`/games/${game.id}`}
                    className="flex items-center gap-2 py-2 text-sm hover:bg-zinc-800/50 -mx-2 px-2 rounded transition-colors"
                  >
                    <span
                      className={`text-xs font-bold w-10 shrink-0 ${RESULT_COLOR[game.result]}`}
                    >
                      {RESULT_LABEL[game.result]}
                    </span>
                    <span className="text-zinc-300 truncate min-w-0">
                      {game.color === 'white' ? 'White' : 'Black'} vs {game.opponent}
                    </span>
                    <span className="text-xs text-zinc-600 shrink-0">{game.timeClass}</span>

                    <span className="ml-auto shrink-0">
                      {hasReview(game) ? (
                        <StatusTag tone="review">◆ reviewed</StatusTag>
                      ) : (
                        <span className="text-xs text-zinc-700">not reviewed</span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
