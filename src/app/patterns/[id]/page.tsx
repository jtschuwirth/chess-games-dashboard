'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import PatternForm from '@/components/PatternForm'
import PatternLineCard from '@/components/PatternLineCard'
import { deletePattern, getGames, getOpenings, getPatterns, updatePattern } from '@/lib/firestore'
import { openingLabel } from '@/lib/opening'
import {
  ESSENTIALS_SECTIONS,
  KIND_BADGE,
  KIND_LABEL,
  gamesTagged,
  hasMethod,
  pointText,
  lineHasContent,
  motifOf,
  normalizePattern,
} from '@/lib/pattern'
import { trainableMistakes } from '@/lib/review'
import type { GameRecord, NewPattern, OpeningLine, PatternRecord } from '@/types/chess'

/**
 * (i), (ii), (iii) — how the method itself letters its points.
 *
 * Only ever a handful per question, so the numerals stop where they stop being read at
 * a glance; past that it falls back to the figure, which is the honest thing to show.
 */
const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
function roman(n: number): string {
  return NUMERALS[n - 1] ?? String(n)
}

function PatternBody({ userId, patternId }: { userId: string; patternId: string }) {
  const router = useRouter()
  const [pattern, setPattern] = useState<PatternRecord | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [games, setGames] = useState<GameRecord[]>([])
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Whether Delete has been pressed once and is waiting to be meant. */
  const [confirming, setConfirming] = useState(false)
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
      setPattern(normalizePattern({ ...next, id: patternId } as PatternRecord))
      setEditing(false)
      setError(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that pattern.'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Deleting asks first, and asks in place rather than in a dialog.
   *
   * It used to go on the first click. A write-up is the only copy of work you typed —
   * the method's answers, the lines, the comments on them — and nothing here can undo
   * it, so a mis-click next to Edit cost the lot. The second press is the confirmation,
   * which keeps it one control rather than a modal to dismiss.
   */
  async function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }

    setBusy(true)
    try {
      await deletePattern(userId, patternId)
      router.push('/patterns')
    } catch (caught) {
      setError(errorText(caught, 'Could not delete that pattern.'))
      setConfirming(false)
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

  /*
   * One description, not two. They answer the same question at two depths, so the
   * method replaces the conditions wherever it has been answered — which is the whole
   * reason a write-up picks one in the form. Conditions written before that choice
   * existed still show on a write-up with no method, so nothing is hidden for good.
   */
  const showConditions = !hasMethod(pattern) && pattern.conditions.length > 0

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
          {motifOf(pattern) && (
            <span className="text-xs font-mono text-zinc-400">{motifOf(pattern)}</span>
          )}
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
            title={confirming ? 'This cannot be undone' : undefined}
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

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/*
        The method's own answers, in the order it asks for them and rendered from the
        same table the form writes against — so the questions on the page and the fields
        that fill them cannot drift. A question left unanswered is left out rather than
        shown empty: the form is where the prompts belong, and this is the read.
      */}
      {/*
        Unanswered questions are left out rather than shown as empty prompts — this is
        the read, and the form is where the prompts belong. But a document with none of
        them answered would then render nothing at all between its name and its
        examples, which reads as a page that failed rather than one not written yet.
      */}
      {hasMethod(pattern) && pattern.essentials && (
        <div className="grid lg:grid-cols-2 gap-3">
          {ESSENTIALS_SECTIONS.map(section => {
            const points = pattern.essentials![section.key].filter(
              point => point.trim().length > 0,
            )
            if (points.length === 0) return null

            return (
              <div
                key={section.key}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2"
              >
                <h3 className="text-xs uppercase tracking-wide text-zinc-500">
                  <span className="text-zinc-600">{section.number}.</span> {section.title}
                </h3>
                <ol className="flex flex-col gap-1.5">
                  {points.map((point, index) => (
                    <li key={index} className="text-sm text-zinc-300 flex gap-2">
                      {/* lettered the way the method writes them up */}
                      <span className="text-zinc-600 font-mono shrink-0">
                        ({roman(index + 1)})
                      </span>
                      <span className="min-w-0">{pointText(point)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )
          })}
        </div>
      )}

      {/*
        When it applies and where it turns up answer the same question, so they sit on one
        row above the board rather than one on each side of it. Wrapping rather than a
        two-column grid, so a pattern with only one of them gets the whole width instead
        of half and a gap.
      */}
      {(showConditions || linkedOpenings.length > 0) && (
        <div className="flex flex-wrap gap-3 items-start">
          {showConditions && (
            <div className="flex-1 min-w-[16rem] bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
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

          {linkedOpenings.length > 0 && (
            <div className="flex-1 min-w-[16rem] bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-wide text-zinc-500">
                Openings it turns up in
              </h3>
              <div className="flex gap-1.5 flex-wrap">
                {/* pills, because two underlined links side by side read as one long name */}
                {linkedOpenings.map(opening => (
                  <Link
                    key={opening.id}
                    href={`/dashboard?opening=${opening.id}`}
                    className="px-2 py-1 rounded-md border border-zinc-800 bg-zinc-950/60 text-xs text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors"
                  >
                    {openingLabel(opening)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {examples.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">Examples</h3>
          {examples.map((example, index) => (
            <PatternLineCard key={index} line={example} fallbackTitle={`Example ${index + 1}`} />
          ))}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">
          Games where this could have been used
        </h3>
        {flagged.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing tagged with this yet — it shows up in the review form under Patterns.
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
