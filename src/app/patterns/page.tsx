'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { drillSummary } from '@/lib/pattern-drill'
import Chip from '@/components/Chip'
import Panel from '@/components/Section'
import { FilterGrid, FilterRow } from '@/components/FilterPanel'
import PatternForm from '@/components/PatternForm'
import { getGames, getOpenings, getPatterns, savePattern } from '@/lib/firestore'
import {
  DESCRIPTION_LABEL,
  DESCRIPTIONS,
  ESSENTIALS_SECTIONS,
  KIND_BADGE,
  KIND_LABEL,
  PATTERN_KINDS,
  describedBy,
  motifOf,
  normalizePattern,
  patternBody,
  pointsBySection,
  timesTagged,
} from '@/lib/pattern'
import type { Description } from '@/lib/pattern'
import type {
  GameRecord,
  NewPattern,
  OpeningLine,
  PatternKind,
  PatternRecord,
} from '@/types/chess'

/** One row of the list: the write-up and the figures read off it. */
interface Row {
  pattern: PatternRecord
  kind: PatternKind
  motif: string | null
  /** Which description it carries — the mark on the row and the chip that finds it. */
  written: Description
  /** Points under each of the method's four questions, in the table's own order. */
  points: number[]
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
  written: Description | null
  motif: string | null
}

const NOTHING: Find = { text: '', kind: null, written: null, motif: null }

function readFind(params: ReturnType<typeof useSearchParams>): Find {
  const kind = params.get('kind')
  const written = params.get('written')
  return {
    text: params.get('q') ?? '',
    // an unknown value is dropped rather than passed through, so a hand-typed URL
    // cannot invent a category the list has no way to draw
    kind: PATTERN_KINDS.includes(kind as PatternKind) ? (kind as PatternKind) : null,
    written: DESCRIPTIONS.includes(written as Description) ? (written as Description) : null,
    motif: params.get('motif'),
  }
}

function writeFind(find: Find): string {
  const query = new URLSearchParams()
  if (find.text.trim()) query.set('q', find.text.trim())
  if (find.kind) query.set('kind', find.kind)
  if (find.written) query.set('written', find.written)
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
  if (ignore !== 'written' && find.written && row.written !== find.written) return false
  if (ignore !== 'motif' && find.motif && row.motif !== find.motif) return false
  return true
}

/**
 * Which of the method's four questions have been answered.
 *
 * This is the mark the list was missing. A row said `12 points` where a write-up had
 * been taken apart and said nothing at all where it had not — so the state you are
 * looking for was an *absence*, which reads as the row having nothing to report rather
 * than as work waiting. Four markers say it positively, and say more than a yes would:
 * three filled and one empty is a write-up whose boundaries are half written, and 3a
 * and 3b are the two questions the drill is built out of.
 */
function MethodMark({ points }: { points: number[] }) {
  return (
    <div className="shrink-0 hidden sm:flex items-center gap-1">
      {ESSENTIALS_SECTIONS.map((section, at) => (
        <span
          key={section.key}
          title={`${section.number}. ${section.title} — ${
            points[at] > 0 ? `${points[at]} point${points[at] === 1 ? '' : 's'}` : 'not written'
          }`}
          className={`w-6 py-0.5 text-center text-[10px] font-mono rounded ${
            points[at] > 0 ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-700'
          }`}
        >
          {section.number}
        </span>
      ))}
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
  const [mountedAt] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const search = useMemo(() => writeFind(find), [find])
  const narrowed = search.length > 0

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
        written: describedBy(pattern),
        points: pointsBySection(pattern.essentials),
        times: timesTagged(games, pattern),
      }))
      .sort(
        (a, b) =>
          (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0) ||
          a.pattern.name.localeCompare(b.pattern.name),
      )
  }, [patterns, games])

  const shown = useMemo(() => rows.filter(row => matches(row, find)), [rows, find])

  /*
   * What a row offers is read off everything you have written, never off the slice in
   * front of you. Measured against the slice, chips appeared and disappeared as you
   * typed in the box — a control that rearranges itself while you are aiming it. What
   * the current slice has none of is disabled instead, which says the same thing and
   * leaves the row where it was.
   */
  const kinds = useMemo(() => {
    const present = new Set(rows.map(row => row.kind))
    return PATTERN_KINDS.filter(kind => present.has(kind))
  }, [rows])

  const motifs = useMemo(() => {
    const present = new Set<string>()
    for (const row of rows) if (row.motif) present.add(row.motif)
    return [...present].sort((a, b) => a.localeCompare(b))
  }, [rows])

  /**
   * How many each chip would give you, measured with the other rows in force but not
   * with its own.
   *
   * They are not drawn: a number on every chip is a column of digits to look past, and
   * on a row of three it mostly repeats what the list underneath already says. What
   * they decide is which chips have nothing behind them, and what the tooltip answers
   * when you want the figure anyway.
   */
  const counts = useMemo(() => {
    const of = (ignore: keyof Find, test: (row: Row) => boolean) =>
      rows.filter(row => matches(row, find, ignore) && test(row)).length

    return {
      kind: new Map(kinds.map(kind => [kind, of('kind', row => row.kind === kind)])),
      written: new Map(
        DESCRIPTIONS.map(written => [written, of('written', row => row.written === written)]),
      ),
      motif: new Map(motifs.map(motif => [motif, of('motif', row => row.motif === motif)])),
    }
  }, [rows, find, kinds, motifs])

  if (error && patterns === null) {
    return <LoadError message={error} onRetry={() => setReload(n => n + 1)} />
  }

  // how much the boundary drill has waiting, which is what the link says
  // read once at mount: calling the clock in a render is what the purity rule forbids,
  // and a due count that changed mid-render would be a different answer each time
  const drill = drillSummary(patterns ?? [], mountedAt)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-zinc-500 max-w-xl">
          Ideas you can carry between openings. Each name becomes a tag in the review form, so a
          mistake can point at the thing you should have played — and any of them can be taken
          apart against the essentials method.
        </p>
        {!adding && (
          <div className="flex items-center gap-2 shrink-0">
            {/*
              Only once there is something to do. A control that is always there and
              always says nothing due is a control you stop reading.
            */}
            {drill.total > 0 && (
              <Link
                href="/patterns/drill"
                title={
                  drill.due > 0
                    ? `${drill.due} of ${drill.total} boundaries are due`
                    : 'Nothing due — every boundary is scheduled ahead'
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  drill.due > 0
                    ? 'border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Drill{drill.due > 0 ? ` · ${drill.due}` : ''}
              </Link>
            )}
            <button
              onClick={() => setAdding(true)}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors"
            >
              New pattern
            </button>
          </div>
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

            It is the games dashboard's filter in every respect that is not about games:
            the same panel, the same two-track grid, the same chip, and the same single
            Reset appearing only once something is narrowed. A filter that looked like
            this on one screen and like a loose stack of buttons on another would be two
            answers to one question.
          */}
          <Panel
            id="patterns-filters"
            title="Filters"
            meta={
              `${shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}` +
              ` write-up${rows.length === 1 ? '' : 's'}` +
              (narrowed ? ' · narrowed' : '')
            }
            actions={
              narrowed && (
                <button
                  onClick={() => setFind(NOTHING)}
                  className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Reset
                </button>
              )
            }
          >
            <FilterGrid>
              <FilterRow label="Find">
                <input
                  value={find.text}
                  onChange={event => setFind(current => ({ ...current, text: event.target.value }))}
                  placeholder="Name, motif or condition"
                  className="w-full sm:max-w-sm bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600"
                />
              </FilterRow>

              <FilterRow label="Kind">
                <Chip
                  active={find.kind === null}
                  onClick={() => setFind(c => ({ ...c, kind: null, motif: null }))}
                >
                  any
                </Chip>
                {kinds.map(kind => (
                  <Chip
                    key={kind}
                    active={find.kind === kind}
                    disabled={find.kind !== kind && (counts.kind.get(kind) ?? 0) === 0}
                    // a motif belongs to a kind, so changing the kind drops it rather than
                    // leaving a filter on that nothing in the new slice could match
                    onClick={() =>
                      setFind(c => ({ ...c, kind: c.kind === kind ? null : kind, motif: null }))
                    }
                    title={`${counts.kind.get(kind) ?? 0} of them`}
                  >
                    {KIND_LABEL[kind]}
                  </Chip>
                ))}
              </FilterRow>

              {/*
                Which have been taken apart against the method, which is the question the
                old document type was really being asked — and now answers it without a
                second copy of the idea to keep in step. The chips are the words the mark
                on each row uses, so the thing you spotted is the thing you press.
              */}
              <FilterRow
                label="Written up"
                title="Which description it carries: the method's four questions taken apart, a line of conditions, or neither yet"
              >
                <Chip
                  active={find.written === null}
                  onClick={() => setFind(c => ({ ...c, written: null }))}
                >
                  any
                </Chip>
                {DESCRIPTIONS.map(written => (
                  <Chip
                    key={written}
                    active={find.written === written}
                    disabled={find.written !== written && (counts.written.get(written) ?? 0) === 0}
                    onClick={() =>
                      setFind(c => ({ ...c, written: c.written === written ? null : written }))
                    }
                    title={`${counts.written.get(written) ?? 0} of them`}
                  >
                    {DESCRIPTION_LABEL[written]}
                  </Chip>
                ))}
              </FilterRow>

              {motifs.length > 0 && (
                <FilterRow label="Motif">
                  <Chip
                    active={find.motif === null}
                    onClick={() => setFind(c => ({ ...c, motif: null }))}
                  >
                    any
                  </Chip>
                  {motifs.map(motif => (
                    <Chip
                      key={motif}
                      active={find.motif === motif}
                      disabled={find.motif !== motif && (counts.motif.get(motif) ?? 0) === 0}
                      onClick={() =>
                        setFind(c => ({ ...c, motif: c.motif === motif ? null : motif }))
                      }
                      title={`${counts.motif.get(motif) ?? 0} of them`}
                    >
                      {motif}
                    </Chip>
                  ))}
                </FilterRow>
              )}
            </FilterGrid>
          </Panel>

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
              {shown.map(({ pattern, kind, motif, written, points, times }) => {
                const total = points.reduce((sum, count) => sum + count, 0)

                return (
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

                    <MethodMark points={points} />

                    <div className="shrink-0 flex items-center gap-3 text-xs text-zinc-600">
                      {/*
                        One column, one meaning: what the description amounts to. A
                        write-up taken apart reports its points, and one that has not
                        been says which basic it carries instead — the figure and the
                        fallback are the same answer at two depths, so they share a slot
                        rather than leaving a gap down the list.
                      */}
                      <span
                        className={`w-20 text-right ${
                          written === 'nothing' ? 'text-zinc-700' : 'text-zinc-500'
                        }`}
                      >
                        {written === 'method' ? `${total} points` : DESCRIPTION_LABEL[written]}
                      </span>
                      <span className="w-14 text-right">
                        {pattern.examples.length} line{pattern.examples.length === 1 ? '' : 's'}
                      </span>
                      {/*
                        Plain, not amber. It is one count among three on a row you scan,
                        and a colour here was claiming an importance the figure does not
                        have — the amber belongs where a mistake is being reported.
                      */}
                      <span className="w-16 text-right text-zinc-500">
                        {times > 0 ? `${times} flagged` : ''}
                      </span>
                    </div>
                  </Link>
                )
              })}
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
