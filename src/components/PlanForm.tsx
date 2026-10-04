'use client'

import { useState } from 'react'
import Chip from '@/components/Chip'
import { MAX_PLAN_WEEKS, buildPlan, startOfDay } from '@/lib/plan'

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

/**
 * Starting a plan. The tasks are typed once and copied onto every day, because a week
 * of practice is nearly the same every day and filling four fields seven times is the
 * kind of friction that stops a plan being written at all. Every day is editable
 * afterwards.
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
  const [tasks, setTasks] = useState(
    'daily game\nsolve puzzles ×5\nplay rapid 15+10 games ×2\nanalyse the games',
  )
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
        tasks: tasks.split('\n'),
      }),
    )
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
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Starts
            <span className="normal-case tracking-normal text-zinc-700"> — day one</span>
          </span>
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
            — seven days each, counted from the start date rather than from a Monday. Up to{' '}
            {MAX_PLAN_WEEKS}, and you can add more as you go.
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
          Each day, to start with
          <span className="normal-case tracking-normal text-zinc-700">
            {' '}
            — the base every day begins from, one task per line. Any day can then be changed on
            its own. End a line with ×5 for something you do five times.
          </span>
        </span>
        <textarea
          value={tasks}
          onChange={event => setTasks(event.target.value)}
          rows={5}
          className={`${INPUT} resize-y`}
        />
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
