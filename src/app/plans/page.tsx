'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import PlanForm from '@/components/PlanForm'
import { getPlans, savePlan } from '@/lib/firestore'
import { buildPlan, planProgress, planRange, todayPosition, weekLabel } from '@/lib/plan'
import type { StudyPlan } from '@/types/chess'


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
          What to work through, week by week, and how much of it you have done. Each day lists
          the games you played that day, so the plan and the work end up in the same place.
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

      {adding && <PlanForm busy={busy} onCreate={create} onCancel={() => setAdding(false)} />}

      {error && plans !== null && <p className="text-xs text-red-400">{error}</p>}

      {plans === null ? (
        <div className="py-16 flex justify-center">
          <Spinner size="w-6 h-6" />
        </div>
      ) : plans.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          No plans yet — write down what you are working through.
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
