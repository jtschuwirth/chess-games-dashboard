'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import LineBoard from '@/components/LineBoard'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import PatternForm from '@/components/PatternForm'
import { deletePattern, getGames, getOpenings, getPatterns, updatePattern } from '@/lib/firestore'
import { openingLabel } from '@/lib/opening'
import { KIND_BADGE, KIND_LABEL, gamesTagged, lineHasContent } from '@/lib/pattern'
import { trainableMistakes } from '@/lib/review'
import type {
  GameRecord,
  NewPattern,
  OpeningLine,
  PatternLine,
  PatternRecord,
} from '@/types/chess'

/**
 * One line, read rather than edited. The board and the note sit side by side because
 * the note is about the position on the board, not about the pattern as a whole.
 */
function LineCard({ line, fallbackTitle }: { line: PatternLine; fallbackTitle: string }) {
  return (
    <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900 flex flex-col gap-3">
      <h3 className="text-sm font-medium text-zinc-100">{line.title.trim() || fallbackTitle}</h3>

      <div className="grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-4 items-start">
        <div className="w-full max-w-[20rem] mx-auto md:mx-0">
          <LineBoard
            moves={line.moves}
            startPly={line.startPly}
            orientation={line.orientation ?? 'white'}
          />
        </div>

        {line.note.trim().length > 0 && (
          <p className="text-sm text-zinc-400 whitespace-pre-wrap min-w-0">{line.note}</p>
        )}
      </div>
    </div>
  )
}

function PatternBody({ userId, patternId }: { userId: string; patternId: string }) {
  const router = useRouter()
  const [pattern, setPattern] = useState<PatternRecord | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [games, setGames] = useState<GameRecord[]>([])
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true

    Promise.all([getPatterns(userId), getOpenings(userId), getGames(userId)])
      .then(([loadedPatterns, loadedOpenings, loadedGames]) => {
        if (!live) return
        const found = loadedPatterns.find(entry => entry.id === patternId) ?? null
        setPattern(found)
        setMissing(found === null)
        setOpenings(loadedOpenings)
        setGames(loadedGames)
        setError(null)
      })
      .catch(caught => {
        if (!live) return
        setError(errorText(caught, 'Could not load this pattern.'))
      })

    return () => {
      live = false
    }
  }, [userId, patternId, reload])

  async function handleSave(next: NewPattern) {
    setBusy(true)
    try {
      await updatePattern(userId, patternId, next)
      setPattern({ ...next, id: patternId })
      setEditing(false)
      setError(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that pattern.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deletePattern(userId, patternId)
      router.push('/patterns')
    } catch (caught) {
      setError(errorText(caught, 'Could not delete that pattern.'))
      setBusy(false)
    }
  }

  /** The games whose review reached for this pattern, newest first. */
  const flagged = useMemo(
    () =>
      pattern
        ? gamesTagged(games, pattern).sort((a, b) => b.playedAt - a.playedAt)
        : [],
    [games, pattern],
  )

  const linkedOpenings = useMemo(
    () => openings.filter(opening => pattern?.openingIds.includes(opening.id)),
    [openings, pattern],
  )

  if (error && pattern === null && !missing) {
    return <LoadError message={error} onRetry={() => setReload(n => n + 1)} />
  }

  if (missing) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <p className="text-sm text-zinc-500">That pattern is not there any more.</p>
        <Link href="/patterns" className="text-sm text-zinc-300 underline">
          Back to patterns
        </Link>
      </div>
    )
  }

  if (!pattern) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/patterns" className="text-sm text-zinc-500 hover:text-zinc-300 self-start">
          ← All patterns
        </Link>
        <PatternForm
          initial={pattern}
          openings={openings}
          busy={busy}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  const examples = pattern.examples.filter(lineHasContent)

  return (
    <div className="flex flex-col gap-5">
      <Link href="/patterns" className="text-sm text-zinc-500 hover:text-zinc-300 self-start">
        ← All patterns
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <h2 className="text-xl font-semibold text-zinc-100">{pattern.name}</h2>
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
              KIND_BADGE[pattern.kind]
            }`}
          >
            {KIND_LABEL[pattern.kind]}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-100 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {pattern.conditions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">Conditions</h3>
          <ul className="flex flex-col gap-1">
            {pattern.conditions.map((condition, index) => (
              <li key={index} className="text-sm text-zinc-300 flex gap-2">
                <span className="text-zinc-600">•</span>
                <span className="min-w-0">{condition}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LineCard line={pattern.main} fallbackTitle="The idea" />

      {linkedOpenings.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">Openings it turns up in</h3>
          <div className="flex gap-2 flex-wrap">
            {linkedOpenings.map(opening => (
              <Link
                key={opening.id}
                href={`/dashboard?opening=${opening.id}`}
                className="text-sm text-zinc-300 underline decoration-zinc-700 hover:decoration-zinc-400"
              >
                {openingLabel(opening)}
              </Link>
            ))}
          </div>
        </div>
      )}

      {examples.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">Examples</h3>
          {examples.map((example, index) => (
            <LineCard key={index} line={example} fallbackTitle={`Example ${index + 1}`} />
          ))}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">
          Games where you wanted this
        </h3>
        {flagged.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing tagged with this yet. It shows up in the review form under Patterns.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-800">
            {flagged.map(game => {
              const moves = trainableMistakes(game.review)
                .filter(mistake => mistake.tags.includes(pattern.name.trim().toLowerCase()))
                .map(mistake => mistake.san)

              return (
                <Link
                  key={game.id}
                  href={`/games/${game.id}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-zinc-800/50 -mx-2 px-2 rounded transition-colors"
                >
                  <span className="text-zinc-300 min-w-0 truncate">
                    vs {game.opponent}
                    <span className="text-zinc-600"> · {new Date(game.playedAt).toLocaleDateString()}</span>
                  </span>
                  <span className="font-mono text-xs text-zinc-500 shrink-0">
                    {moves.join(', ')}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PatternPage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Pattern" wide>
      {user => <PatternBody key={params.id} userId={user.uid} patternId={params.id} />}
    </PageShell>
  )
}
