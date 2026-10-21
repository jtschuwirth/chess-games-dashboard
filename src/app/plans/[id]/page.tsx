'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { PlanRatings } from '@/components/PlanRatings'
import PlanWeekCard from '@/components/PlanWeekCard'
import { formatMoment } from '@/lib/days'
import { deletePlan, getGames, getPlans, getRatingHistory, updatePlan } from '@/lib/firestore'
import { clearDraft, planChanged, readDraft, writeDraft } from '@/lib/plan-draft'
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
import type { GameRecord, NewStudyPlan, StudyPlan } from '@/types/chess'

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

  /** The plan as Firestore last confirmed it, which is what "unsaved" is measured against. */
  const [stored, setStored] = useState<NewStudyPlan | null>(null)
  const [saving, setSaving] = useState(false)
  /** When a draft restored from this device was last edited, or null if there was none. */
  const [restored, setRestored] = useState<number | null>(null)

  useEffect(() => {
    let live = true

    Promise.all([getPlans(userId), getGames(userId), getRatingHistory(userId)])
      .then(([plans, loadedGames, loadedHistory]) => {
        if (!live) return
        const found = plans.find(entry => entry.id === planId) ?? null

        /*
          A draft on this device usually outranks what Firestore has, because it exists
          only where edits were made and not saved. It is restored rather than offered,
          and the page says so and offers to throw it away — being asked a question before
          you can see your own plan is worse.

          Unless another device has saved since it was written. Then it is not newer work,
          it is work that has already been moved past, and restoring it would quietly undo
          whatever the phone did. `updatedAt` is what tells them apart; a plan from before
          that field existed has none, and falls back to the draft winning.
        */
        const draft = found ? readDraft(userId, planId) : null
        const body = found ? planBody(found) : null
        const superseded =
          draft !== null && found?.updatedAt !== undefined && draft.editedAt < found.updatedAt

        if (found && draft && body && !superseded && planChanged(draft.plan, body)) {
          setPlan({ ...found, ...draft.plan })
          setRestored(draft.editedAt)
        } else {
          if (draft) clearDraft(userId, planId)
          setPlan(found)
          setRestored(null)
        }

        setStored(body)
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
   * An edit changes the screen, and an effect puts it on the device. Nothing else.
   *
   * It used to write the whole plan to Firestore every time, which lost data twice over:
   * each write replaces the document and several in flight are not ordered, so an earlier
   * snapshot could land last and undo the edits after it — and anything not yet sent when
   * the tab was suspended existed only in React state. Saving is a button now.
   *
   * This also removed a ref. Edits still have to compose inside one React batch — three
   * quick clicks on a stepper once landed as one, because each read the plan from its own
   * render — and the fix was a ref carrying the newest plan forward synchronously. The
   * only thing that needed the new value synchronously was the Firestore write, so with
   * that gone a plain updater does it: React applies queued updaters in order against the
   * latest state, which is the composition the ref was standing in for.
   */
  const save = useCallback(
    (update: (current: StudyPlan) => StudyPlan) => {
      setPlan(current => (current ? update(current) : current))
    },
    [],
  )

  const unsaved = plan !== null && stored !== null && planChanged(planBody(plan), stored)

  /**
   * The draft follows the plan rather than being written by each edit, which is what lets
   * the edit be a plain updater. It writes only when there is something to keep: an
   * unchanged plan would otherwise rewrite the draft on every load.
   */
  useEffect(() => {
    if (plan && unsaved) writeDraft(userId, planId, planBody(plan))
  }, [plan, unsaved, userId, planId])

  /** One write, for everything since the last one. */
  async function commit() {
    if (!plan) return

    setSaving(true)
    setError(null)

    const body = planBody(plan)
    try {
      await updatePlan(userId, planId, body)
      setStored(body)
      clearDraft(userId, planId)
      setRestored(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save this plan — your changes are still here.'))
    } finally {
      setSaving(false)
    }
  }

  /** Throw the draft away and take what Firestore has. */
  function discard() {
    clearDraft(userId, planId)
    setRestored(null)
    setReload(count => count + 1)
  }

  /**
   * The browser's own warning, for the one exit the draft cannot cover. Closing the tab
   * leaves the draft on disk and it comes back next visit, so this is a courtesy rather
   * than a last line of defence — which is why there is no matching guard on the in-app
   * links: leaving and returning restores the draft.
   */
  useEffect(() => {
    if (!unsaved) return

    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

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

        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap justify-end">
          <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/70 rounded-full"
              style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-zinc-500 tabular-nums">
            {done}/{total}
          </span>

          {unsaved && (
            <button
              onClick={discard}
              title="Throw away everything since the last save and reload the stored plan"
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Discard
            </button>
          )}

          {/* always here rather than appearing with the first edit, so it is a thing you
              know is there and reach for, and its label is the state of the plan */}
          <button
            onClick={commit}
            disabled={!unsaved || saving}
            title={
              unsaved
                ? 'Write every change since the last save, in one go'
                : 'Everything here is saved'
            }
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:hover:bg-zinc-100"
          >
            {saving ? 'Saving…' : unsaved ? 'Save changes' : 'Saved'}
          </button>

          <button
            onClick={remove}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {restored !== null && (
        <p className="text-xs text-amber-400">
          Unsaved changes from {formatMoment(restored)} were picked up from this device.
          Save them, or discard to go back to the stored plan.
        </p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <PlanRatings plan={plan} history={history} />

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
    <PageShell title="Study plan" tab="Plan" wide>
      {user => <PlanBody key={params.id} userId={user.uid} planId={params.id} />}
    </PageShell>
  )
}
