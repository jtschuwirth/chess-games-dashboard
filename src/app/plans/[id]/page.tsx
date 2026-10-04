'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import PlanDayCard from '@/components/PlanDayCard'
import { deletePlan, getGames, getPlans, updatePlan } from '@/lib/firestore'
import { dayDate, planBody, planProgress, todayIndex } from '@/lib/plan'
import type { GameRecord, StudyPlan } from '@/types/chess'

function PlanBody({ userId, planId }: { userId: string; planId: string }) {
  const router = useRouter()
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [games, setGames] = useState<GameRecord[]>([])
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true

    Promise.all([getPlans(userId), getGames(userId)])
      .then(([plans, loadedGames]) => {
        if (!live) return
        const found = plans.find(entry => entry.id === planId) ?? null
        setPlan(found)
        setMissing(found === null)
        setGames(loadedGames)
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
   * Every edit writes the whole plan. It is a small document, a write is a write
   * whatever its size, and rewriting it removes every question about two edits racing.
   * The screen updates first and the write follows, so ticking a box never waits.
   *
   * `latest` is what makes two changes in one React batch compose instead of clobbering:
   * each edit is a function of the plan as it stands, and the ref moves on synchronously,
   * so the second click sees the first. Deriving from the rendered `plan` meant ticking
   * two boxes quickly left only the second ticked.
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
    if (!plan) return
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
  const today = todayIndex(plan)

  return (
    <div className="flex flex-col gap-4">
      <Link href="/plans" className="text-sm text-zinc-500 hover:text-zinc-300 self-start">
        ← All plans
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-zinc-100">{plan.name}</h2>
          <p className="text-xs text-zinc-500">
            {done} of {total} done
            {today !== null ? ` · day ${today + 1} is today` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/70 rounded-full"
              style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }}
            />
          </div>
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
        {plan.days.map((day, index) => (
          <PlanDayCard
            key={index}
            index={index}
            day={day}
            date={dayDate(plan, index)}
            isToday={today === index}
            games={games}
            onChange={update =>
              save(current => ({
                ...current,
                days: current.days.map((entry, i) => (i === index ? update(entry) : entry)),
              }))
            }
          />
        ))}
      </div>
    </div>
  )
}

export default function PlanPage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Study plan">
      {user => <PlanBody key={params.id} userId={user.uid} planId={params.id} />}
    </PageShell>
  )
}
