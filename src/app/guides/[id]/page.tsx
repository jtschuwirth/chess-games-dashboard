'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ExerciseCard from '@/components/ExerciseCard'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { clearDraft, readDraft, writeDraft } from '@/lib/draft'
import {
  MAX_EXERCISES,
  emptyExercise,
  exerciseChanged,
  exerciseHasContent,
  guideBody,
  guideProgress,
  moveExercise,
} from '@/lib/exercise'
import { deleteGuide, getGuides, updateGuide } from '@/lib/firestore'
import type { ExerciseGuide } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

function GuideBody({ userId, guideId }: { userId: string; guideId: string }) {
  const router = useRouter()
  const [guide, setGuide] = useState<ExerciseGuide | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  /** Which exercise is open. One at a time: twelve boards at once is a page to scroll. */
  const [openId, setOpenId] = useState<string | null>(null)
  /** When this device last wrote a draft, so the page can say what it restored. */
  const [restored, setRestored] = useState<number | null>(null)
  /**
    * The guide as the server last had it.
    *
    * A per-exercise save writes around it: everything the server holds, with the one
    * exercise you pressed Save on replaced. Without a baseline there is nothing to write
    * around — saving one exercise would mean writing the whole working copy under
    * another name, which is just Save guide.
    */
  const [savedGuide, setSavedGuide] = useState<ExerciseGuide | null>(null)
  /** Which exercise is being written right now, so only its own button says so. */
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = useCallback(
    () =>
      getGuides(userId)
        .then(loaded => {
          const found = loaded.find(entry => entry.id === guideId) ?? null
          setMissing(found === null)
          if (!found) return

          /*
           * A draft on this device outranks the server until the server moves past it.
           * It exists only because edits were made and not saved, so it is newer work —
           * unless another device has saved since, in which case restoring it would
           * quietly undo whatever that device did. The same comparison a plan makes.
           */
          const draft = readDraft<ExerciseGuide>(
            'guide',
            userId,
            guideId,
            body => Boolean(body) && Array.isArray((body as ExerciseGuide).exercises),
          )

          // the baseline is always the server's copy, draft or no draft: it is what a
          // per-exercise save writes around, and the draft is by definition not saved
          setSavedGuide(found)

          if (draft && (!found.updatedAt || draft.editedAt >= found.updatedAt)) {
            setGuide({ ...draft.body, id: guideId })
            setRestored(draft.editedAt)
          } else {
            if (draft) clearDraft('guide', userId, guideId)
            setGuide(found)
            setRestored(null)
          }
          setLoadError(null)
        })
        .catch(caught => setLoadError(errorText(caught, 'Could not load that guide.'))),
    [userId, guideId],
  )

  useEffect(() => {
    load()
  }, [load])

  /*
   * Every edit is a function of the current value, never of a rendered snapshot. Several
   * handlers in one React batch all read the same render, so composing them any other way
   * loses all but the last — the trap the plan page's steppers hit twice.
   */
  const edit = useCallback(
    (update: (current: ExerciseGuide) => ExerciseGuide) => {
      setGuide(current => {
        if (!current) return current
        const next = update(current)
        writeDraft('guide', userId, guideId, next)
        return next
      })
      setSaved(false)
      setSavedId(null)
    },
    [userId, guideId],
  )

  /*
   * Derived rather than a flag. A flag can only say that something was touched, so a
   * word typed and deleted again left the sheet claiming unsaved changes with nothing to
   * save — and once one exercise can be saved on its own, "is there anything left" is a
   * question only a comparison can answer.
   */
  const dirty = useMemo(
    () => guide !== null && JSON.stringify(guideBody(guide)) !== JSON.stringify(savedGuide ? guideBody(savedGuide) : null),
    [guide, savedGuide],
  )

  const changedIds = useMemo(() => {
    if (!guide) return new Set<string>()
    const base = new Map((savedGuide?.exercises ?? []).map(entry => [entry.id, entry]))
    return new Set(
      guide.exercises
        .filter(entry => exerciseChanged(entry, base.get(entry.id)))
        .map(entry => entry.id),
    )
  }, [guide, savedGuide])

  const progress = useMemo(() => (guide ? guideProgress(guide) : null), [guide])

  async function save() {
    if (!guide) return
    setSaving(true)
    setError(null)
    try {
      // the ones you started and left are dropped, the same as an empty pattern example
      const kept = { ...guide, exercises: guide.exercises.filter(exerciseHasContent) }
      await updateGuide(userId, guideId, guideBody(kept))
      clearDraft('guide', userId, guideId)
      setGuide(kept)
      setSavedGuide(kept)
      setRestored(null)
      setSaved(true)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that guide.'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Write one exercise and leave the rest of the sheet unsaved.
   *
   * The whole document still goes to Firestore — a guide is one document and an exercise
   * is an entry in its array, so there is nothing smaller to write. What makes this a
   * partial save is *what* is written: the server's own copy with this one exercise
   * replaced, so every other edit on the device stays a draft and nothing you were still
   * in the middle of is committed by a press you made somewhere else.
   *
   * The order is the sheet's rather than the exercise's, so it is taken from the baseline
   * and left alone. An exercise the server has never seen is the one case with no place
   * to go back to, and it is inserted where it sits in the working copy.
   */
  async function saveExercise(id: string) {
    if (!guide || !savedGuide || savingId) return

    const current = guide.exercises.find(entry => entry.id === id)
    if (!current || !exerciseHasContent(current)) return

    setSavingId(id)
    setError(null)
    try {
      const base = savedGuide.exercises
      const at = base.findIndex(entry => entry.id === id)

      let exercises: typeof base
      if (at === -1) {
        const into = Math.min(
          Math.max(guide.exercises.findIndex(entry => entry.id === id), 0),
          base.length,
        )
        exercises = [...base.slice(0, into), current, ...base.slice(into)]
      } else {
        exercises = base.map(entry => (entry.id === id ? current : entry))
      }

      const next = { ...savedGuide, exercises }
      await updateGuide(userId, guideId, guideBody(next))
      setSavedGuide(next)
      setSavedId(id)
      setSaved(false)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that exercise.'))
    } finally {
      setSavingId(null)
    }
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setSaving(true)
    try {
      await deleteGuide(userId, guideId)
      clearDraft('guide', userId, guideId)
      router.push('/guides')
    } catch (caught) {
      setError(errorText(caught, 'Could not delete that guide.'))
      setSaving(false)
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={load} />
  if (missing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-400">That guide is not here any more.</p>
        <Link href="/guides" className="text-sm text-zinc-500 hover:text-zinc-300 self-start">
          ← All guides
        </Link>
      </div>
    )
  }
  if (!guide || !progress) return <Spinner />

  return (
    <div className="flex flex-col gap-5">
      <Link href="/guides" className="text-sm text-zinc-500 hover:text-zinc-300 self-start">
        ← All guides
      </Link>

      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <input
            value={guide.name}
            onChange={event => edit(current => ({ ...current, name: event.target.value }))}
            aria-label="Guide name"
            className="text-xl font-semibold text-zinc-100 bg-transparent outline-none border-b border-transparent focus:border-zinc-700 min-w-0 flex-1"
          />
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-zinc-500">
              {progress.total === 0
                ? 'no positions yet'
                : `${progress.solved} of ${progress.total} solved`}
              {progress.attempted > 0 && (
                <span className="text-zinc-600"> · {progress.attempted} started</span>
              )}
            </span>
            <button
              onClick={remove}
              disabled={saving}
              className={`text-xs transition-colors disabled:opacity-40 ${
                confirming ? 'text-red-400 font-medium' : 'text-zinc-600 hover:text-red-400'
              }`}
            >
              {confirming ? 'Really delete?' : 'Delete'}
            </button>
            {confirming && (
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Keep
              </button>
            )}
          </div>
        </div>

        <textarea
          value={guide.description}
          onChange={event => edit(current => ({ ...current, description: event.target.value }))}
          rows={2}
          aria-label="What these exercises are about"
          placeholder="What these are about — the theme the set is training."
          className={`${INPUT} resize-y text-zinc-400`}
        />
      </div>

      {restored !== null && (
        <p className="text-xs text-amber-400/90">
          Restored what you had not saved on this device, from{' '}
          {new Date(restored).toLocaleString()}.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {guide.exercises.map((exercise, index) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            index={index}
            last={index === guide.exercises.length - 1}
            open={openId === exercise.id}
            onToggleOpen={() => setOpenId(current => (current === exercise.id ? null : exercise.id))}
            onChange={next =>
              edit(current => ({
                ...current,
                exercises: current.exercises.map(entry =>
                  entry.id === next.id ? next : entry,
                ),
              }))
            }
            onRemove={() =>
              edit(current => ({
                ...current,
                exercises: current.exercises.filter(entry => entry.id !== exercise.id),
              }))
            }
            onMove={direction =>
              edit(current => ({
                ...current,
                exercises: moveExercise(current.exercises, exercise.id, direction),
              }))
            }
            onSave={() => saveExercise(exercise.id)}
            saving={savingId === exercise.id}
            unsaved={changedIds.has(exercise.id)}
            justSaved={savedId === exercise.id}
          />
        ))}

        {guide.exercises.length < MAX_EXERCISES && (
          <button
            type="button"
            onClick={() => {
              const next = emptyExercise()
              edit(current => ({ ...current, exercises: [...current.exercises, next] }))
              // opened straight away: you added it to paste a position into it
              setOpenId(next.id)
            }}
            className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            + Add a position
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap border-t border-zinc-800 pt-4">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-4 py-2 text-xs rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save guide'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
        {dirty && !saving && (
          <span className="text-xs text-zinc-600">
            {changedIds.size > 0
              ? `${changedIds.size} exercise${changedIds.size === 1 ? '' : 's'} unsaved`
              : 'unsaved changes'}
          </span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  )
}

export default function GuidePage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Exercise guide" tab="Guide" wide>
      {user => <GuideBody key={params.id} userId={user.uid} guideId={params.id} />}
    </PageShell>
  )
}
