'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import PlanWeekCard from '@/components/PlanWeekCard'
import { deletePlan, getGames, getPlans, getRatingHistory, updatePlan } from '@/lib/firestore'
import {
  MAX_PLAN_WEEKS,
  buildWeek,
  planBody,
  planProgress,
  planRange,
  templateFrom,
  todayPosition,
  weekLabel,
  weekProgress,
} from '@/lib/plan'
import type { RatingHistory } from '@/lib/rating-history'
import type { GameRecord, StudyPlan } from '@/types/chess'

/**
 * Which week to open on arrival: the one today falls in, or failing that the first with
 * anything still to do. A plan you have finished opens on its last week rather than on
 * nothing.
 */
function weekToOpen(plan: StudyPlan): number {
  const today = todayPosition(plan)
  if (today) return today.week

  const unfinished = plan.weeks.findIndex(week => {
    const { done, total } = weekProgress(week)
    return total === 0 || done < total
  })
  return unfinished === -1 ? Math.max(0, plan.weeks.length - 1) : unfinished
}

function PlanBody({ userId, planId }: { userId: string; planId: string }) {
  const router = useRouter()
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [games, setGames] = useState<GameRecord[]>([])
  const [history, setHistory] = useState<RatingHistory>({})
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true

    Promise.all([getPlans(userId), getGames(userId), getRatingHistory(userId)])
      .then(([plans, loadedGames, loadedHistory]) => {
        if (!live) return
        const found = plans.find(entry => entry.id === planId) ?? null
        setPlan(found)
        setMissing(found === null)
        setGames(loadedGames)
        setHistory(loadedHistory)
        setError(null)
      })
      .catch(caught => {
        if (!live) return
        setError(errorText(caught, 'Could not load this plan.'))
      })

    return () => {
      live = false
    }
  }, [userId, planId, reload])

  /**
   * Every edit writes the whole plan. It is a small document, a write is a write whatever
   * its size, and rewriting it removes every question about two edits racing. The screen
   * updates first and the write follows, so ticking a box never waits.
   *
   * `latest` is what makes two changes in one React batch compose instead of clobbering:
   * each edit is a function of the plan as it stands, and the ref moves on synchronously,
   * so the second click sees the first. Deriving from the rendered `plan` meant three
   * quick clicks landed as one.
   */
  const latest = useRef<StudyPlan | null>(null)

  const save = useCallback(
    (update: (current: StudyPlan) => StudyPlan) => {
      // null until the first edit, when the freshly loaded plan is the newest there is
      const base = latest.current ?? plan
      if (!base) return

      const next = update(base)
      latest.current = next
      setPlan(next)

      updatePlan(userId, planId, planBody(next)).catch(caught => {
        setError(errorText(caught, 'That change was not saved — try again.'))
      })
    },
    [userId, planId, plan],
  )

  async function remove() {
    try {
      await deletePlan(userId, planId)
      router.push('/plans')
    } catch (caught) {
      setError(errorText(caught, 'Could not delete that plan.'))
    }
  }

  if (error && plan === null && !missing) {
    return <LoadError message={error} onRetry={() => setReload(n => n + 1)} />
  }

  if (missing) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <p className="text-sm text-zinc-500">That plan is not there any more.</p>
        <Link href="/plans" className="text-sm text-zinc-300 underline">
          Back to plans
        </Link>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  const { done, total } = planProgress(plan)
  const today = todayPosition(plan)
  const openWeek = weekToOpen(plan)

  return (
    <div className="flex flex-col gap-4">
      <Link href="/plans" className="text-sm text-zinc-500 hover:text-zinc-300 self-start">
        ← All plans
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-zinc-100">{plan.name}</h2>
          <p className="text-xs text-zinc-500">
            {planRange(plan)} · {plan.weeks.length} week{plan.weeks.length === 1 ? '' : 's'}
            {today
              ? ` · ${weekLabel(plan.weeks[today.week], today.week)}, day ${today.day + 1} is today`
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/70 rounded-full"
              style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-zinc-500 tabular-nums">
            {done}/{total}
          </span>
          <button
            onClick={remove}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        {plan.weeks.map((week, index) => (
          <PlanWeekCard
            key={index}
            plan={plan}
            index={index}
            games={games}
            today={today}
            history={history}
            startOpen={index === openWeek}
            onChange={update =>
              save(current => ({
                ...current,
                weeks: current.weeks.map((entry, i) => (i === index ? update(entry) : entry)),
              }))
            }
            onRemove={() =>
              save(current => ({
                ...current,
                weeks: current.weeks.filter((_, i) => i !== index),
              }))
            }
          />
        ))}
      </div>

      {plan.weeks.length < MAX_PLAN_WEEKS && (
        <button
          onClick={() =>
            save(current => ({
              ...current,
              // a new week asks for whatever the last one asks for
              weeks: [...current.weeks, buildWeek(templateFrom(current))],
            }))
          }
          className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          + Add a week
        </button>
      )}
    </div>
  )
}

export default function PlanPage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Study plan" wide>
      {user => <PlanBody key={params.id} userId={user.uid} planId={params.id} />}
    </PageShell>
  )
}
