'use client'

import { useState } from 'react'
import {
  DAYS_PER_WEEK,
  parseTaskLine,
  templateFromJson,
  templateToJson,
} from '@/lib/plan'
import type { PlanTask, PlanTemplateDay } from '@/types/chess'

/**
 * The week every other week is shown through, as a thing you edit.
 *
 * Shared by the form that creates a plan and the card on the plan itself, because they
 * are the same job at two moments: setting one up before there is anything to tick, and
 * changing it once the weeks are running. Two copies would be two places for the `×5`
 * rule and the JSON shape to drift, which is the reason every other vocabulary here is
 * written once.
 *
 * The rows are deliberately thinner than a day's. A template says *what to do*, so it
 * has a text box, how many there are and a way to remove one; it has no tick, no
 * stepper, no note and no grip, because none of those are things a template can answer.
 */
export default function TemplateEditor({
  template,
  labelFor,
  onChange,
}: {
  template: PlanTemplateDay[] | undefined
  /** What to call each position — the weekday, read off whatever start date is in force. */
  labelFor: (index: number) => string
  /**
   * The whole week back, or `undefined` once nothing is left in it.
   *
   * Absent rather than seven empty entries, so a plan with nothing in its template has
   * no field — which is what lets its days stop inheriting the moment the last task
   * goes, and what keeps the writer from storing an empty one.
   */
  onChange: (next: PlanTemplateDay[] | undefined) => void
}) {
  /** The JSON box, seeded when it is opened rather than bound to the template. */
  const [json, setJson] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const days = Array.from(
    { length: DAYS_PER_WEEK },
    (unused, index) => template?.[index]?.tasks ?? [],
  )

  function setDay(index: number, update: (current: PlanTask[]) => PlanTask[]) {
    // one object per day, never a list of lists: Firestore rejects the whole document
    // over an array directly inside an array, which is how this shipped broken once
    const next = days.map((tasks, at) => ({ tasks: at === index ? update(tasks) : tasks }))
    onChange(next.some(day => day.tasks.length > 0) ? next : undefined)
  }

  /** Replace the week with what is in the box, or say why that cannot be done. */
  function importJson() {
    const read = templateFromJson(json ?? '')
    if (typeof read === 'string') {
      setJsonError(read)
      return
    }

    onChange(read.template ?? undefined)
    setJsonError(null)
    setJson(null)
  }

  return (
    <div className="flex flex-col gap-2">
      {days.map((tasks, index) => (
        <TemplateDay
          key={index}
          label={labelFor(index)}
          tasks={tasks}
          onChange={update => setDay(index, update)}
        />
      ))}

      {/*
        A week as text, which is how one gets from a notebook into the app and from one
        plan into the next. Seven lists of plain lines, with the `×5` `parseTaskLine`
        already understands — so the exported shape is the shape you would type, and a
        week can be written by hand without knowing anything about `target`.

        One box for both directions, seeded when it is opened rather than bound to the
        template: a box that rewrote itself as you typed into it could not be edited.
      */}
      <div className="border-t border-zinc-800 pt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            setJson(json === null ? templateToJson(template) : null)
            setJsonError(null)
            setCopied(false)
          }}
          className="self-start text-xs text-zinc-600 hover:text-zinc-200 transition-colors"
        >
          {json === null ? '+ As JSON' : '− As JSON'}
        </button>

        {json !== null && (
          <>
            <textarea
              value={json}
              onChange={event => {
                setJson(event.target.value)
                setJsonError(null)
              }}
              rows={8}
              spellCheck={false}
              aria-label="The template as JSON"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-zinc-600 resize-y"
            />

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(json).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  )
                }}
                className="px-2 py-1 text-xs rounded-md border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100 transition-colors"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>

              <button
                type="button"
                onClick={importJson}
                className="px-2 py-1 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
              >
                Replace the week
              </button>

              {/* the one thing the box cannot say: an import is the whole week */}
              <span className="text-xs text-zinc-600">
                Replacing puts the whole week in.
              </span>
            </div>

            {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
          </>
        )}
      </div>
    </div>
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
          exactly as it does anywhere else a template line is written.
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
