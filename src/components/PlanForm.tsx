'use client'

import { useState } from 'react'
import Chip from '@/components/Chip'
import TemplateEditor from '@/components/TemplateEditor'
import { formatDay } from '@/lib/days'
import { buildPlan, dateAt, parseTaskLine, startOfDay } from '@/lib/plan'
import type { PlanTask, PlanTemplateDay } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

const LENGTHS = [1, 2, 4, 8, 12]

/** `YYYY-MM-DD` for a date input, in local time rather than UTC. */
function dateValue(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** The same four tasks every day, which is what a plan looked like before templates. */
function startingWeek(): PlanTemplateDay[] {
  const tasks = ['daily game', 'solve puzzles ×5', 'play rapid 15+10 games ×2', 'analyse the games']
    .map(parseTaskLine)
    .filter((task): task is PlanTask => task !== null)

  return Array.from({ length: 7 }, () => ({ tasks: tasks.map(task => ({ ...task })) }))
}

/**
 * Starting a plan: a name, a start date, how long, and **the template week**.
 *
 * It used to be one list of tasks copied onto every day of every week, which is what
 * the template replaced — and a plan built that way arrived with all eighty-four days
 * already written, so nothing inherited and the template had nothing left to do.
 * Setting the template up here instead means a new plan starts in the state a plan
 * should start in: the week says what to do, and not one day has been said anything
 * about.
 *
 * It is the same editor the plan's own card uses, so a week can be typed out or pasted
 * in as JSON before the plan exists — which is the other half of why it belongs here.
 */
export default function PlanForm({
  busy,
  onCreate,
  onCancel,
}: {
  busy: boolean
  onCreate: (plan: ReturnType<typeof buildPlan>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState(() => dateValue(Date.now()))
  const [weeks, setWeeks] = useState(4)
  const [template, setTemplate] = useState<PlanTemplateDay[] | undefined>(startingWeek)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('Give the plan a name — whatever you are working through.')
      return
    }

    // the date input hands back YYYY-MM-DD, which Date reads as UTC midnight
    const [year, month, day] = start.split('-').map(Number)
    if (!year || !month || !day) {
      setError('Pick a start date.')
      return
    }

    setError(null)
    onCreate(
      buildPlan({
        name: trimmed,
        startDate: startOfDay(new Date(year, month - 1, day).getTime()),
        weeks,
        template,
      }),
    )
  }

  /**
   * What to call each position in the week, read off the date as it is picked.
   *
   * The whole point of the template being by position is that position 0 is always the
   * same weekday — so the labels follow the start date rather than being fixed, or a
   * plan starting on a Wednesday would be set up against somebody else's Monday.
   */
  function labelFor(index: number): string {
    const [year, month, day] = start.split('-').map(Number)
    if (!year || !month || !day) return ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][index]

    const first = startOfDay(new Date(year, month - 1, day).getTime())
    return formatDay(dateAt({ startDate: first }, index)).split(' ')[0]
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Name</span>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Yusupov intermediate"
            className={INPUT}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Starts</span>
          <input
            type="date"
            value={start}
            onChange={event => setStart(event.target.value)}
            className={`${INPUT} [color-scheme:dark]`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          How many weeks
          <span className="normal-case tracking-normal text-zinc-700">
            {' '}
            — from the start date, not from a Monday
          </span>
        </span>
        <div className="flex gap-1 flex-wrap">
          {LENGTHS.map(value => (
            <Chip key={value} active={weeks === value} onClick={() => setWeeks(value)}>
              {value} week{value === 1 ? '' : 's'}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          The template week
          <span className="normal-case tracking-normal text-zinc-700">
            {' '}
            — what each day asks for, on every week
          </span>
        </span>
        <TemplateEditor template={template} labelFor={labelFor} onChange={setTemplate} />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create plan'}
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
