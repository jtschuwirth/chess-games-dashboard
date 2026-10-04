'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Chip from '@/components/Chip'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { getPlans, savePlan } from '@/lib/firestore'
import {
  MAX_PLAN_WEEKS,
  buildPlan,
  planProgress,
  planRange,
  startOfDay,
  todayPosition,
  weekLabel,
} from '@/lib/plan'
import type { StudyPlan } from '@/types/chess'

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
function NewPlanForm({
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
      setError('Give the plan a name — "week 1" is enough.')
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
            placeholder="week 1"
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
            — seven days each, up to {MAX_PLAN_WEEKS}; you can add more later
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
          Each day
          <span className="normal-case tracking-normal text-zinc-700">
            {' '}
            — one per line, on every day. End a line with ×5 for something you do five
            times
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

function PlansBody({ userId }: { userId: string }) {
  const [plans, setPlans] = useState<StudyPlan[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true

    getPlans(userId)
      .then(loaded => {
        if (!live) return
        setPlans(loaded)
        setError(null)
      })
      .catch(caught => {
        if (!live) return
        setError(errorText(caught, 'Could not load your plans.'))
      })

    return () => {
      live = false
    }
  }, [userId, reload])

  async function create(plan: ReturnType<typeof buildPlan>) {
    setBusy(true)
    try {
      const id = await savePlan(userId, plan)
      setPlans(prev => [{ ...plan, id }, ...(prev ?? [])])
      setAdding(false)
      setError(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that plan.'))
    } finally {
      setBusy(false)
    }
  }

  if (error && plans === null) {
    return <LoadError message={error} onRetry={() => setReload(n => n + 1)} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-zinc-500 max-w-xl">
          What to do, day by day, and whether you did it. Each day collects the reviews you wrote
          that day, so the plan and the work end up in the same place.
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors shrink-0"
          >
            New plan
          </button>
        )}
      </div>

      {adding && <NewPlanForm busy={busy} onCreate={create} onCancel={() => setAdding(false)} />}

      {error && plans !== null && <p className="text-xs text-red-400">{error}</p>}

      {plans === null ? (
        <div className="py-16 flex justify-center">
          <Spinner size="w-6 h-6" />
        </div>
      ) : plans.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          No plans yet — write down what this week is for.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {plans.map(plan => {
            const { done, total } = planProgress(plan)
            const today = todayPosition(plan)

            return (
              <Link
                key={plan.id}
                href={`/plans/${plan.id}`}
                className="flex items-center gap-4 border border-zinc-800 rounded-xl px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-100">{plan.name}</span>
                    {today && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                        {weekLabel(plan.weeks[today.week], today.week)}, day {today.day + 1}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">
                    {planRange(plan)} · {plan.weeks.length} week
                    {plan.weeks.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/70 rounded-full"
                      style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-zinc-500 w-14 text-right tabular-nums">
                    {done}/{total}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PlansPage() {
  return <PageShell title="Study plans">{user => <PlansBody userId={user.uid} />}</PageShell>
}
