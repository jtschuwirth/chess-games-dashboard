'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Chip from '@/components/Chip'
import PatternForm from '@/components/PatternForm'
import { getGames, getOpenings, getPatterns, savePattern } from '@/lib/firestore'
import {
  KIND_BADGE,
  KIND_LABEL,
  PATTERN_KINDS,
  TYPE_BADGE,
  TYPE_LABEL,
  essentialsCount,
  motifOf,
  normalizePattern,
  timesTagged,
  typeOf,
} from '@/lib/pattern'
import type {
  GameRecord,
  NewPattern,
  OpeningLine,
  PatternRecord,
  PatternType,
} from '@/types/chess'

function PatternsBody({ userId }: { userId: string }) {
  const [patterns, setPatterns] = useState<PatternRecord[] | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [games, setGames] = useState<GameRecord[]>([])
  /** Which document the open form is writing, or null when it is closed. */
  const [adding, setAdding] = useState<PatternType | null>(null)
  /** Narrow the tactics section to one motif. Null is all of them. */
  const [motif, setMotif] = useState<string | null>(null)
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
      // read it back through the normaliser, so a row shows what a reload would show
      setPatterns(prev => [...(prev ?? []), normalizePattern({ ...pattern, id } as PatternRecord)])
      setAdding(null)
      setError(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that pattern.'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * One section per kind, in the table's own order, and a kind you have written nothing
   * under is left out rather than shown empty. The headings come from `PATTERN_KINDS`,
   * so a fifth kind would bring its own section with it.
   */
  const sections = useMemo(() => {
    const rows = (patterns ?? []).map(pattern => ({
      pattern,
      times: timesTagged(games, pattern),
      motif: motifOf(pattern),
    }))

    return PATTERN_KINDS.map(kind => {
      const all = rows.filter(row => row.pattern.kind === kind)
      // the chips offer only what is actually filed here, the way the Control chips do
      const motifs = [...new Set(all.map(row => row.motif).filter((m): m is string => m !== null))]
      return {
        kind,
        all,
        motifs: motifs.sort(),
        shown: motif === null ? all : all.filter(row => row.motif === motif),
      }
    }).filter(section => section.all.length > 0)
  }, [patterns, games, motif])

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
        {adding === null && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAdding('pattern')}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors"
            >
              New pattern
            </button>
            <button
              onClick={() => setAdding('essentials')}
              title="Work a tactic out against the three questions: what each piece is doing, what weakness lets it happen, and what would break it"
              className="px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              New essentials
            </button>
          </div>
        )}
      </div>

      {adding !== null && (
        <PatternForm
          type={adding}
          openings={openings}
          patterns={(patterns ?? []).filter(entry => typeOf(entry) === 'pattern')}
          busy={busy}
          onSubmit={handleCreate}
          onCancel={() => setAdding(null)}
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
        /*
          Grouped by kind rather than one flat run. The kind then lives on the heading
          and comes off the rows: repeating "Tactics" on every row under a heading that
          says Tactics is noise, and it leaves the row free for what differs — which
          document it is, and which tactic.
        */
        <div className="flex flex-col gap-6">
          {sections.map(section => (
            <div key={section.kind} className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h2
                  className={`text-xs uppercase tracking-wide px-2 py-0.5 rounded border ${
                    KIND_BADGE[section.kind]
                  }`}
                >
                  {KIND_LABEL[section.kind]}
                </h2>
                <span className="text-xs text-zinc-600">
                  {section.all.length} write-up{section.all.length === 1 ? '' : 's'}
                </span>

                {section.motifs.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Chip active={motif === null} onClick={() => setMotif(null)}>
                      any
                    </Chip>
                    {section.motifs.map(option => (
                      <Chip
                        key={option}
                        active={motif === option}
                        onClick={() => setMotif(motif === option ? null : option)}
                      >
                        {option}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>

              {section.shown.length === 0 ? (
                <p className="text-sm text-zinc-600">Nothing filed under {motif} here.</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {section.shown.map(({ pattern, times, motif: its }) => (
                    <Link
                      key={pattern.id}
                      href={`/patterns/${pattern.id}`}
                      className="flex flex-col gap-2 border border-zinc-800 rounded-xl p-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-100 min-w-0">
                          {pattern.name}
                        </span>
                        <span
                          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
                            TYPE_BADGE[typeOf(pattern)]
                          }`}
                        >
                          {TYPE_LABEL[typeOf(pattern)]}
                        </span>
                      </div>

                      {its && <span className="text-xs text-zinc-400 font-mono">{its}</span>}

                      {pattern.conditions.length > 0 && (
                        <p className="text-xs text-zinc-500 line-clamp-2">
                          {pattern.conditions[0]}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-zinc-600 mt-auto pt-1">
                        <span>
                          {pattern.examples.length} line
                          {pattern.examples.length === 1 ? '' : 's'}
                        </span>
                        {typeOf(pattern) === 'essentials' && (
                          <span>{essentialsCount(pattern.essentials)} points</span>
                        )}
                        {times > 0 && <span className="text-amber-400/80">{times} flagged</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
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
