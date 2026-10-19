'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { getGuides, saveGuide } from '@/lib/firestore'
import { guideProgress } from '@/lib/exercise'
import type { ExerciseGuide } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

function GuidesBody({ userId }: { userId: string }) {
  const [guides, setGuides] = useState<ExerciseGuide[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      getGuides(userId)
        .then(loaded => {
          setGuides(loaded)
          setLoadError(null)
        })
        .catch(caught => setLoadError(errorText(caught, 'Could not load your guides.'))),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  async function create() {
    if (name.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      await saveGuide(userId, {
        name: name.trim(),
        description: description.trim(),
        exercises: [],
        // stamped on the press rather than in a render, which the purity rule forbids
        createdAt: Date.now(),
      })
      setName('')
      setDescription('')
      setAdding(false)
      await load()
    } catch (caught) {
      setError(errorText(caught, 'Could not save that guide.'))
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={load} />
  if (!guides) return <Spinner />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-zinc-500 max-w-xl">
          A sheet of positions to solve — a handout, a chapter, a set your coach gave you.
          Paste each diagram in as a FEN, play the answer out on the board and write down
          what each move is for.
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors shrink-0"
          >
            New guide
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wide text-zinc-500">Name</label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Sacrificios simulados"
              className={INPUT}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wide text-zinc-500">
              What these are about
            </label>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={2}
              placeholder="Sacrifices that look like sacrifices and are not — the material comes straight back."
              className={`${INPUT} resize-y`}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={create}
              disabled={busy || name.trim().length === 0}
              className="px-4 py-2 text-xs rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Saving…' : 'Create'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      )}

      {guides.length === 0 && !adding ? (
        <p className="text-sm text-zinc-600">
          No guides yet. The first one is a name and a line about what it trains.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {guides.map(guide => {
            const progress = guideProgress(guide)

            return (
              <Link
                key={guide.id}
                href={`/guides/${guide.id}`}
                className="flex flex-col gap-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-sm font-medium text-zinc-100">{guide.name}</span>
                  <span className="text-xs text-zinc-500">
                    {progress.total === 0
                      ? 'no positions yet'
                      : `${progress.solved} of ${progress.total} solved`}
                    {progress.attempted > 0 && (
                      <span className="text-zinc-600"> · {progress.attempted} started</span>
                    )}
                  </span>
                </div>
                {guide.description.trim().length > 0 && (
                  <span className="text-xs text-zinc-500 line-clamp-2">{guide.description}</span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function GuidesPage() {
  return (
    <PageShell title="Exercise guides">{user => <GuidesBody userId={user.uid} />}</PageShell>
  )
}
