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
  type TaskAt,
} from '@/lib/plan'
import { hasReview } from '@/lib/review'
import { dropSlot, dropTarget, type TaskDragController } from '@/lib/use-task-drag'
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
 * Where the task would land, drawn in the gap it would land in.
 *
 * Inside the row and absolutely placed, so nothing moves: a marker inserted *between*
 * the rows would push everything below it down as the pointer crossed each boundary,
 * which changes the very rectangles the drop target is being measured from and leaves
 * the line flickering between two gaps.
 */
function Gap({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute left-0 right-0 h-0.5 rounded-full bg-sky-400 ${
        edge === 'top' ? '-top-1' : '-bottom-1'
      }`}
    />
  )
}

/**
 * The grip, drawn rather than typed.
 *
 * `⠿` is the conventional glyph and is a glyph: the board already learned here that a
 * character renders differently per font and can render as nothing at all, and a missing
 * box on the one control you are trying to find is worse than anywhere else. Six circles
 * in their own `viewBox` scale with the row and look the same everywhere.
 */
function GripDots() {
  return (
    <svg viewBox="0 0 6 10" aria-hidden="true" fill="currentColor" className="w-1.5 h-2.5">
      <circle cx="1.2" cy="1.2" r="0.9" />
      <circle cx="4.8" cy="1.2" r="0.9" />
      <circle cx="1.2" cy="5" r="0.9" />
      <circle cx="4.8" cy="5" r="0.9" />
      <circle cx="1.2" cy="8.8" r="0.9" />
      <circle cx="4.8" cy="8.8" r="0.9" />
    </svg>
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
  at,
  task,
  drag,
  insertBefore,
  insertAfter,
  onPatch,
  onRemove,
}: {
  /** Which day this row is in and where in it, which is what a drop needs to say. */
  at: TaskAt
  task: PlanTask
  drag: TaskDragController
  insertBefore: boolean
  insertAfter: boolean
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
  const carried = drag.isCarrying(at)

  return (
    <div
      {...dropSlot(at.index)}
      className={`relative flex items-center gap-2.5 group/task transition-opacity ${
        carried ? 'opacity-30' : ''
      }`}
    >
      {insertBefore && <Gap edge="top" />}
      {insertAfter && <Gap edge="bottom" />}

      {/*
        The grip is its own control because the row cannot be one: the middle of it is a
        text field, and dragging from a text field is selecting text.

        `touch-none` is what makes a finger work. Without it the browser claims the
        gesture as a scroll before the second move arrives and cancels the drag.
      */}
      <button
        type="button"
        data-plan-grip=""
        aria-label={`Move ${task.text.trim() || 'this task'}`}
        title="Drag to move this task, or press it and use ↑ ↓"
        onPointerDown={event => drag.grab(at, task.text, event)}
        onKeyDown={event => {
          const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
          if (step === 0) return
          event.preventDefault()

          /*
            The row that will hold this task is the sibling it is heading for, and it is
            in the document already — rows are keyed by position, so the elements stay
            put and only their contents change. Focusing it after the move keeps a second
            press on the same task instead of on whichever task slid into the old slot,
            which is the index-captured-by-the-render trap `moveExercise` writes down.
            A press at either end finds no sibling, and the move is a no-op anyway.
          */
          const row = event.currentTarget.parentElement
          const next = step < 0 ? row?.previousElementSibling : row?.nextElementSibling

          // one step down is the gap *after* the next task, which is two gaps along
          drag.move(at, { ...at, index: at.index + (step < 0 ? -1 : 2) })
          next?.querySelector<HTMLElement>('[data-plan-grip]')?.focus()
        }}
        className="w-3 h-5 shrink-0 flex items-center justify-center text-zinc-700 hover:text-zinc-300 focus-visible:text-zinc-300 transition-colors cursor-grab active:cursor-grabbing touch-none outline-none"
      >
        <GripDots />
      </button>

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
  week,
  index,
  day,
  date,
  isToday,
  games,
  drag,
  onChange,
}: {
  /** Which week this day belongs to, since a task can be dragged out of it into another. */
  week: number
  index: number
  day: PlanDay
  date: number
  isToday: boolean
  games: GameRecord[]
  drag: TaskDragController
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

  /** Where a carried task would land in this day, or null when it would not land here. */
  const insertion = drag.insertionAt(week, index)

  function patchTask(taskIndex: number, update: (current: PlanTask) => PlanTask) {
    onChange(current => ({
      ...current,
      tasks: current.tasks.map((task, i) => (i === taskIndex ? update(task) : task)),
    }))
  }

  return (
    /*
      The whole card is the drop target, not the task list: a folded day draws no rows
      and is still somewhere to put a task, and over the games below the tasks the
      forgiving answer — append — is also the right one. The count is on the card for
      the folded case, where there is nothing in the page to measure against.
    */
    <section
      {...dropTarget(week, index, day.tasks.length)}
      className={`border rounded-xl bg-zinc-900 transition-colors ${
        insertion === null ? 'border-zinc-800' : 'border-sky-500/50 ring-1 ring-sky-500/30'
      }`}
    >
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
                at={{ week, day: index, index: taskIndex }}
                task={task}
                drag={drag}
                insertBefore={insertion === taskIndex}
                insertAfter={insertion === day.tasks.length && taskIndex === day.tasks.length - 1}
                onPatch={update => patchTask(taskIndex, update)}
                onRemove={() =>
                  onChange(current => ({
                    ...current,
                    tasks: current.tasks.filter((_, i) => i !== taskIndex),
                  }))
                }
              />
            ))}

            {/* a day with nothing in it has no row to hang the line off */}
            {day.tasks.length === 0 && insertion === 0 && (
              <span aria-hidden="true" className="h-0.5 rounded-full bg-sky-400" />
            )}

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
