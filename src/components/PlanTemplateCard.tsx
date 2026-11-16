'use client'

import { useState } from 'react'
import { DAYS_PER_WEEK, dayDate, parseTaskLine, templateFor } from '@/lib/plan'
import { formatDay } from '@/lib/days'
import type { PlanTask, StudyPlan } from '@/types/chess'

/**
 * The week every other week is shown through.
 *
 * A plan is the same handful of tasks on most days, and typing them into eighty-four
 * days is why a plan does not get written down. So one week says what each weekday asks
 * for; every day of every week draws its tasks from the entry at its own position, and
 * none of it reaches a day's document until that day is touched.
 *
 * It is **above** the weeks because it is what they are made of: the thing you set up
 * once, before there is anything to tick. Folded by default for the same reason — it is
 * read when a plan is being written and almost never afterwards.
 *
 * The rows are deliberately thinner than a day's. A template says what to do, so it has
 * a text box, how many there are and a way to remove one; it has no tick, no stepper, no
 * note and no grip, because none of those are things a template can answer. Drawing a
 * day's row here would offer four controls that do nothing.
 */
export default function PlanTemplateCard({
  plan,
  onChange,
}: {
  plan: StudyPlan
  /** An updater, like every edit on this page, for the reason the day card states. */
  onChange: (update: (current: StudyPlan) => StudyPlan) => void
}) {
  const [open, setOpen] = useState(false)

  /** The template as seven lists, whatever the stored one holds. */
  const days = Array.from({ length: DAYS_PER_WEEK }, (unused, index) => templateFor(plan, index))
  const total = days.reduce((count, day) => count + day.length, 0)

  /**
   * One day of the template, written back whole.
   *
   * A template that ends up empty is **removed** rather than stored as seven empty
   * lists, so a plan with no template is a plan with no field — which is what lets the
   * days stop inheriting the moment the last task goes.
   */
  function setDay(index: number, update: (current: PlanTask[]) => PlanTask[]) {
    onChange(current => {
      const next = Array.from({ length: DAYS_PER_WEEK }, (unused, at) =>
        at === index ? update(templateFor(current, at)) : templateFor(current, at),
      )

      const plan = { ...current }
      if (next.some(day => day.length > 0)) plan.template = next
      else delete plan.template
      return plan
    })
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-baseline gap-3 flex-1 min-w-0 text-left"
        >
          <h2 className="text-sm font-semibold text-zinc-100 shrink-0">Template week</h2>
          <span className="text-xs text-zinc-500 truncate">
            {total === 0
              ? 'what every week asks for, before you tick anything'
              : `${total} task${total === 1 ? '' : 's'} across the week`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Fold the template' : 'Open the template'}
          className="w-6 h-6 shrink-0 rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-colors text-sm leading-none"
        >
          {open ? '−' : '+'}
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {/*
            The one thing the rows cannot say: where these tasks turn up, and what makes
            one stop being a template task and start being a day's own.
          */}
          <p className="text-xs text-zinc-600">
            Every day of every week shows the row at its own position. Tick, change or
            mark one on a day and that day is written with these tasks as they stand.
          </p>

          {days.map((tasks, index) => (
            <TemplateDay
              key={index}
              /* the weekday off the plan's own first week, so it reads as you think of it */
              label={formatDay(dayDate(plan, 0, index)).split(' ')[0]}
              tasks={tasks}
              onChange={update => setDay(index, update)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** One weekday of the template: its name, and what it asks for. */
function TemplateDay({
  label,
  tasks,
  onChange,
}: {
  label: string
  tasks: PlanTask[]
  onChange: (update: (current: PlanTask[]) => PlanTask[]) => void
}) {
  function patch(at: number, update: (current: PlanTask) => PlanTask) {
    onChange(current => current.map((task, i) => (i === at ? update(task) : task)))
  }

  return (
    <div className="flex gap-3 items-start">
      <span className="w-10 shrink-0 pt-1.5 text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {tasks.map((task, at) => (
          <div key={at} className="flex items-center gap-2 group/row">
            <input
              value={task.text}
              onChange={event => {
                const text = event.target.value
                patch(at, current => ({ ...current, text }))
              }}
              placeholder="something to do"
              aria-label={`${label} task ${at + 1}`}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-zinc-200 placeholder:text-zinc-700"
            />

            {/* how many of it, the same control a day's row carries and for the same reason */}
            <label className="flex items-center gap-0.5 shrink-0" title="How many of these in a day">
              <span className="text-[10px] text-zinc-700">×</span>
              <input
                type="number"
                min={1}
                max={999}
                value={task.target}
                onChange={event => {
                  const target = Math.max(1, Math.min(999, Math.round(Number(event.target.value) || 1)))
                  patch(at, current => ({ ...current, target }))
                }}
                aria-label={`How many of ${task.text.trim() || 'this task'} in a day`}
                className="w-8 bg-transparent text-xs text-zinc-600 focus:text-zinc-200 outline-none text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>

            <button
              type="button"
              onClick={() => onChange(current => current.filter((_, i) => i !== at))}
              title="Take this off the template"
              aria-label="Take this off the template"
              className="text-xs text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100 shrink-0"
            >
              ✕
            </button>
          </div>
        ))}

        {/*
          `parseTaskLine` rather than a bare task, so `×5` at the end sets the count here
          exactly as it does when a plan is first written — one answer to what a template
          line means.
        */}
        <button
          type="button"
          onClick={() =>
            onChange(current => [...current, parseTaskLine('something to do') as PlanTask])
          }
          aria-label={`Add a task to ${label}`}
          className="self-start text-xs text-zinc-600 hover:text-zinc-200 transition-colors"
        >
          + Add a task
        </button>
      </div>
    </div>
  )
}
