'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Chip from '@/components/Chip'
import PatternForm from '@/components/PatternForm'
import { getGames, getOpenings, getPatterns, savePattern } from '@/lib/firestore'
import {
  KIND_BADGE,
  KIND_LABEL,
  PATTERN_KINDS,
  essentialsCount,
  hasMethod,
  motifOf,
  normalizePattern,
  patternBody,
  timesTagged,
} from '@/lib/pattern'
import type {
  GameRecord,
  NewPattern,
  OpeningLine,
  PatternKind,
  PatternRecord,
} from '@/types/chess'

/** One row of the list: the write-up and the figure read off the games. */
interface Row {
  pattern: PatternRecord
  kind: PatternKind
  motif: string | null
  /** Whether the essentials have been answered — what the Method chips narrow by. */
  method: boolean
  times: number
}

/**
 * What the finder is looking for.
 *
 * All four live in the query string, so a narrowed list is a link and Back from a
 * write-up returns to the slice you came from rather than to everything — the
 * dashboard's rule, for the same reason.
 */
interface Find {
  text: string
  kind: PatternKind | null
  /** 'yes' for the ones taken apart, 'no' for the ones still to do. */
  method: 'yes' | 'no' | null
  motif: string | null
}

const NOTHING: Find = { text: '', kind: null, method: null, motif: null }

function readFind(params: ReturnType<typeof useSearchParams>): Find {
  const kind = params.get('kind')
  const method = params.get('method')
  return {
    text: params.get('q') ?? '',
    // an unknown value is dropped rather than passed through, so a hand-typed URL
    // cannot invent a category the list has no way to draw
    kind: PATTERN_KINDS.includes(kind as PatternKind) ? (kind as PatternKind) : null,
    method: method === 'yes' || method === 'no' ? method : null,
    motif: params.get('motif'),
  }
}

function writeFind(find: Find): string {
  const query = new URLSearchParams()
  if (find.text.trim()) query.set('q', find.text.trim())
  if (find.kind) query.set('kind', find.kind)
  if (find.method) query.set('method', find.method)
  if (find.motif) query.set('motif', find.motif)
  const text = query.toString()
  return text ? `?${text}` : ''
}

/** Everything a row can be found by: what it is called, what it is, and what it says. */
function haystack(row: Row): string {
  return [row.pattern.name, row.motif ?? '', ...row.pattern.conditions].join(' ').toLowerCase()
}

/**
 * Whether a row survives a find, optionally ignoring one axis.
 *
 * The axis is left out when counting what a chip would give you: a kind's count has to
 * be measured with every *other* filter in force but not with the kind itself, or every
 * chip except the active one reads zero.
 */
function matches(row: Row, find: Find, ignore?: keyof Find): boolean {
  if (ignore !== 'text' && find.text.trim()) {
    if (!haystack(row).includes(find.text.trim().toLowerCase())) return false
  }
  if (ignore !== 'kind' && find.kind && row.kind !== find.kind) return false
  if (ignore !== 'method' && find.method && row.method !== (find.method === 'yes')) return false
  if (ignore !== 'motif' && find.motif && row.motif !== find.motif) return false
  return true
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-baseline flex-wrap">
      <span className="text-[11px] uppercase tracking-wide text-zinc-600 w-24 shrink-0">
        {label}
      </span>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  )
}

function PatternsBody({ userId }: { userId: string }) {
  const searchParams = useSearchParams()
  const [patterns, setPatterns] = useState<PatternRecord[] | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [games, setGames] = useState<GameRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [find, setFind] = useState<Find>(() => readFind(searchParams))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const search = useMemo(() => writeFind(find), [find])

  useEffect(() => {
    // replaceState rather than a push, so narrowing the list does not fill the history
    window.history.replaceState(null, '', window.location.pathname + search)
  }, [search])

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
      // through the writer and then the reader, so the new row is exactly the row a
      // reload would draw rather than the form's own untrimmed copy of it
      setPatterns(prev => [
        ...(prev ?? []),
        normalizePattern({ ...patternBody(pattern), id } as PatternRecord),
      ])
      setAdding(false)
      setError(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that pattern.'))
    } finally {
      setBusy(false)
    }
  }

  const rows = useMemo<Row[]>(() => {
    const order = new Map(PATTERN_KINDS.map((kind, at) => [kind, at]))
    return (patterns ?? [])
      .map(pattern => ({
        pattern,
        kind: pattern.kind,
        motif: motifOf(pattern),
        method: hasMethod(pattern),
        times: timesTagged(games, pattern),
      }))
      .sort(
        (a, b) =>
          (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0) ||
          a.pattern.name.localeCompare(b.pattern.name),
      )
  }, [patterns, games])

  const shown = useMemo(() => rows.filter(row => matches(row, find)), [rows, find])

  /** How many each chip would give you, measured with the other filters in force. */
  const counts = useMemo(() => {
    const of = (ignore: keyof Find, test: (row: Row) => boolean) =>
      rows.filter(row => matches(row, find, ignore) && test(row)).length

    return {
      kind: new Map(PATTERN_KINDS.map(k => [k, of('kind', row => row.kind === k)])),
      answered: of('method', row => row.method),
      unanswered: of('method', row => !row.method),
      anyKind: rows.filter(row => matches(row, find, 'kind')).length,
      anyMethod: rows.filter(row => matches(row, find, 'method')).length,
      anyMotif: rows.filter(row => matches(row, find, 'motif')).length,
    }
  }, [rows, find])

  /**
   * The motifs worth offering, which is the ones present in what you are already
   * looking at — the Control chips rule. Without it the row would list sixteen names
   * on an account that has used two.
   */
  const motifs = useMemo(() => {
    const present = new Map<string, number>()
    for (const row of rows) {
      if (!row.motif || !matches(row, find, 'motif')) continue
      present.set(row.motif, (present.get(row.motif) ?? 0) + 1)
    }
    return [...present].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows, find])

  if (error && patterns === null) {
    return <LoadError message={error} onRetry={() => setReload(n => n + 1)} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-zinc-500 max-w-xl">
          Ideas you can carry between openings. Each name becomes a tag in the review form, so a
          mistake can point at the thing you should have played — and any of them can be taken
          apart against the essentials method.
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
          Nothing written up yet — start with the idea you keep missing.
        </p>
      ) : (
        <>
          {/*
            A finder rather than a heading per kind. Four headings over a grid of cards
            reads well at four write-ups and becomes a page you scroll past at forty —
            and by then the question is "where is the one about back rank mates", which
            is a search rather than a scroll. The kind moves onto the row as a badge, and
            the list is sorted by it, so browsing everything still reads grouped.
          */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={find.text}
                onChange={event => setFind(current => ({ ...current, text: event.target.value }))}
                placeholder="Find by name, motif or condition"
                className="flex-1 min-w-[14rem] bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600"
              />
              <span className="text-xs text-zinc-500">
                {shown.length === rows.length
                  ? `${rows.length} write-up${rows.length === 1 ? '' : 's'}`
                  : `${shown.length} of ${rows.length}`}
              </span>
              {search.length > 0 && (
                <button
                  onClick={() => setFind(NOTHING)}
                  className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            <FilterRow label="Kind">
              <Chip
                active={find.kind === null}
                onClick={() => setFind(c => ({ ...c, kind: null, motif: null }))}
              >
                any {counts.anyKind}
              </Chip>
              {PATTERN_KINDS.filter(
                kind => (counts.kind.get(kind) ?? 0) > 0 || find.kind === kind,
              ).map(kind => (
                <Chip
                  key={kind}
                  active={find.kind === kind}
                  // a motif belongs to a kind, so changing the kind drops it rather than
                  // leaving a filter on that nothing in the new slice could match
                  onClick={() =>
                    setFind(c => ({ ...c, kind: c.kind === kind ? null : kind, motif: null }))
                  }
                >
                  {KIND_LABEL[kind]} {counts.kind.get(kind) ?? 0}
                </Chip>
              ))}
            </FilterRow>

            {/*
              Which have been taken apart against the method, which is the question the
              old document type was really being asked — and now answers it without a
              second copy of the idea to keep in step.
            */}
            <FilterRow label="Essentials">
              <Chip
                active={find.method === null}
                onClick={() => setFind(c => ({ ...c, method: null }))}
              >
                any {counts.anyMethod}
              </Chip>
              <Chip
                active={find.method === 'yes'}
                onClick={() => setFind(c => ({ ...c, method: c.method === 'yes' ? null : 'yes' }))}
              >
                answered {counts.answered}
              </Chip>
              <Chip
                active={find.method === 'no'}
                onClick={() => setFind(c => ({ ...c, method: c.method === 'no' ? null : 'no' }))}
              >
                still to do {counts.unanswered}
              </Chip>
            </FilterRow>

            {motifs.length > 0 && (
              <FilterRow label="Motif">
                <Chip
                  active={find.motif === null}
                  onClick={() => setFind(c => ({ ...c, motif: null }))}
                >
                  any {counts.anyMotif}
                </Chip>
                {motifs.map(([name, count]) => (
                  <Chip
                    key={name}
                    active={find.motif === name}
                    onClick={() => setFind(c => ({ ...c, motif: c.motif === name ? null : name }))}
                  >
                    {name} {count}
                  </Chip>
                ))}
              </FilterRow>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              Nothing matches that.{' '}
              <button
                onClick={() => setFind(NOTHING)}
                className="text-zinc-300 underline hover:text-zinc-100"
              >
                Clear the finder
              </button>
              .
            </p>
          ) : (
            /*
              Rows rather than cards. A card is three across and a hand tall, so twelve
              of them is a screenful; the same twelve as rows is a glance, and running
              your eye down a column of names is what you came to do.
            */
            <div className="border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
              {shown.map(({ pattern, kind, motif, times }) => (
                <Link
                  key={pattern.id}
                  href={`/patterns/${pattern.id}`}
                  className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-100">{pattern.name}</span>
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${KIND_BADGE[kind]}`}
                      >
                        {KIND_LABEL[kind]}
                      </span>
                      {motif && <span className="text-xs font-mono text-zinc-400">{motif}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3 text-xs text-zinc-600">
                    <span>
                      {pattern.examples.length} line{pattern.examples.length === 1 ? '' : 's'}
                    </span>
                    {hasMethod(pattern) && (
                      <span>{essentialsCount(pattern.essentials)} points</span>
                    )}
                    {/*
                      Plain, not amber. It is one count among three on a row you scan,
                      and a colour here was claiming an importance the figure does not
                      have — the amber belongs where a mistake is being reported.
                    */}
                    {times > 0 && <span className="text-zinc-500">{times} flagged</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function PatternsPage() {
  return (
    <PageShell title="Patterns" wide>
      {user => (
        <Suspense
          fallback={
            <div className="py-16 flex justify-center">
              <Spinner size="w-6 h-6" />
            </div>
          }
        >
          <PatternsBody userId={user.uid} />
        </Suspense>
      )}
    </PageShell>
  )
}
