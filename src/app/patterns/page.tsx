'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import PatternForm from '@/components/PatternForm'
import { getGames, getOpenings, getPatterns, savePattern } from '@/lib/firestore'
import { KIND_BADGE, KIND_LABEL, timesTagged } from '@/lib/pattern'
import type { GameRecord, NewPattern, OpeningLine, PatternRecord } from '@/types/chess'

function PatternsBody({ userId }: { userId: string }) {
  const [patterns, setPatterns] = useState<PatternRecord[] | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [games, setGames] = useState<GameRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true

    Promise.all([getPatterns(userId), getOpenings(userId), getGames(userId)])
      .then(([loadedPatterns, loadedOpenings, loadedGames]) => {
        if (!live) return
        setPatterns(loadedPatterns)
        setOpenings(loadedOpenings)
        setGames(loadedGames)
        setError(null)
      })
      .catch(caught => {
        if (!live) return
        setError(errorText(caught, 'Could not load your patterns.'))
      })

    return () => {
      live = false
    }
  }, [userId, reload])

  async function handleCreate(pattern: NewPattern) {
    setBusy(true)
    try {
      const id = await savePattern(userId, pattern)
      setPatterns(prev => [...(prev ?? []), { ...pattern, id }])
      setAdding(false)
      setError(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that pattern.'))
    } finally {
      setBusy(false)
    }
  }

  const rows = useMemo(
    () =>
      (patterns ?? []).map(pattern => ({
        pattern,
        times: timesTagged(games, pattern),
      })),
    [patterns, games],
  )

  if (error && patterns === null) {
    return <LoadError message={error} onRetry={() => setReload(n => n + 1)} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-zinc-500 max-w-xl">
          Ideas you can carry between openings. Each one&apos;s name becomes a tag in the review
          form, so a mistake can point at the thing you should have played.
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors shrink-0"
          >
            New pattern
          </button>
        )}
      </div>

      {adding && (
        <PatternForm
          openings={openings}
          busy={busy}
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
        />
      )}

      {error && patterns !== null && <p className="text-xs text-red-400">{error}</p>}

      {patterns === null ? (
        <div className="py-16 flex justify-center">
          <Spinner size="w-6 h-6" />
        </div>
      ) : patterns.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          No patterns yet — write up the first idea you keep missing.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(({ pattern, times }) => (
            <Link
              key={pattern.id}
              href={`/patterns/${pattern.id}`}
              className="flex flex-col gap-2 border border-zinc-800 rounded-xl p-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-zinc-100 min-w-0">{pattern.name}</span>
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
                    KIND_BADGE[pattern.kind]
                  }`}
                >
                  {KIND_LABEL[pattern.kind]}
                </span>
              </div>

              {pattern.conditions.length > 0 && (
                <p className="text-xs text-zinc-500 line-clamp-2">{pattern.conditions[0]}</p>
              )}

              <div className="flex items-center gap-3 text-xs text-zinc-600 mt-auto pt-1">
                <span>
                  {pattern.examples.length + 1} line
                  {pattern.examples.length === 0 ? '' : 's'}
                </span>
                {times > 0 && <span className="text-amber-400/80">{times} flagged</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PatternsPage() {
  return (
    <PageShell title="Patterns" wide>
      {user => <PatternsBody userId={user.uid} />}
    </PageShell>
  )
}
