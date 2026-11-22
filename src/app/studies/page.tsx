'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Chip from '@/components/Chip'
import ColorDot from '@/components/ColorDot'
import { FilterGrid, FilterRow } from '@/components/FilterPanel'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import { getStudies, saveStudyRecord } from '@/lib/firestore'
import {
  NO_STUDY_FILTERS,
  STUDY_KINDS,
  STUDY_KIND_BADGE,
  STUDY_KIND_HINT,
  STUDY_KIND_LABEL,
  matchesStudy,
  newStudy,
  normalizeStudyRecord,
  readStudyKind,
  sortStudies,
  studyFiltersActive,
  studyRecordBody,
  studySize,
  type StudyFilters,
} from '@/lib/studies'
import {
  COLOR_LABEL,
  type OpeningColor,
  type StudyKind,
  type StudyRecord,
} from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

const COLORS: OpeningColor[] = ['any', 'white', 'black']

/**
 * The finder's state, in the query string like the dashboard's.
 *
 * So a narrowed list is a link, and Back from a study returns to the slice you came
 * from. An unknown kind is dropped on read rather than passed through, so a hand-typed
 * URL cannot invent a category.
 */
function readFilters(params: URLSearchParams | ReturnType<typeof useSearchParams>): StudyFilters {
  return { search: params.get('q') ?? '', kind: readStudyKind(params.get('kind')) }
}

function writeFilters(filters: StudyFilters): string {
  const params = new URLSearchParams()
  if (filters.search.trim().length > 0) params.set('q', filters.search.trim())
  if (filters.kind) params.set('kind', filters.kind)
  const query = params.toString()
  return query.length > 0 ? `?${query}` : ''
}

/** What a row reports under the name: only the parts that have anything in them. */
function sizeLine(study: StudyRecord): string {
  const size = studySize(study)
  return (
    [
      size.ideas > 0 ? `${size.ideas} idea${size.ideas === 1 ? '' : 's'}` : '',
      size.patterns > 0 ? `${size.patterns} pattern${size.patterns === 1 ? '' : 's'}` : '',
      size.games > 0 ? `${size.games} game${size.games === 1 ? '' : 's'}` : '',
      size.studies > 0 ? `${size.studies} linked` : '',
    ]
      .filter(part => part.length > 0)
      .join(' · ') || 'nothing written yet'
  )
}

function StudiesBody({ userId }: { userId: string }) {
  const searchParams = useSearchParams()
  const [studies, setStudies] = useState<StudyRecord[] | null>(null)
  const [filters, setFilters] = useState<StudyFilters>(() => readFilters(searchParams))
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<StudyKind>('opening')
  const [color, setColor] = useState<OpeningColor>('any')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const search = useMemo(() => writeFilters(filters), [filters])

  useEffect(() => {
    // replaceState rather than a push, so narrowing the list does not fill the history
    window.history.replaceState(null, '', window.location.pathname + search)
  }, [search])

  useEffect(() => {
    let live = true

    getStudies(userId)
      .then(loaded => {
        if (!live) return
        setStudies(loaded)
        setError(null)
      })
      .catch(caught => {
        if (!live) return
        setError(errorText(caught, 'Could not load your studies.'))
      })

    return () => {
      live = false
    }
  }, [userId, reload])

  async function create() {
    if (name.trim().length === 0) return

    setBusy(true)
    setError(null)
    const body = newStudy({
      name,
      kind,
      color,
      description,
      // stamped on the press rather than in a render, which the purity rule forbids
      createdAt: Date.now(),
    })

    try {
      const id = await saveStudyRecord(userId, body)
      // through the writer and then the reader, so the new row is exactly the row a
      // reload would draw rather than the form's own untrimmed copy of it
      setStudies(current => [
        ...(current ?? []),
        normalizeStudyRecord({ ...studyRecordBody(body), id } as StudyRecord),
      ])
      setName('')
      setDescription('')
      setAdding(false)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that study.'))
    } finally {
      setBusy(false)
    }
  }

  const rows = useMemo(() => sortStudies(studies ?? []), [studies])
  const shown = useMemo(() => rows.filter(study => matchesStudy(study, filters)), [rows, filters])

  /*
   * What the Kind row offers is read off everything you have written, never off the
   * slice in front of you — a control that rearranges itself while you are aiming it is
   * the opposite of one you can press twice without looking. What the slice has none of
   * is disabled instead, and the count is the tooltip rather than a digit on every chip.
   */
  const kinds = useMemo(() => {
    const present = new Set(rows.map(study => study.kind))
    return STUDY_KINDS.filter(entry => present.has(entry))
  }, [rows])

  const counts = useMemo(
    () =>
      new Map(
        kinds.map(entry => [
          entry,
          rows.filter(study => matchesStudy(study, { ...filters, kind: null }) && study.kind === entry)
            .length,
        ]),
      ),
    [kinds, rows, filters],
  )

  if (error && studies === null) {
    return <LoadError message={error} onRetry={() => setReload(count => count + 1)} />
  }

  const narrowed = studyFiltersActive(filters) > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-zinc-500 max-w-xl">
          What you know, written up once and pointed at from everywhere else. An opening
          study names the lines it covers; a structure study is what those openings run
          into. Each one gathers the patterns that apply, the model games showing them and
          the studies it leads to.
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors shrink-0"
          >
            New study
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Panov Attack, Isolated queen’s pawn, Rook and pawn"
            className={INPUT}
          />

          <FilterGrid>
            <FilterRow label="Kind">
              {STUDY_KINDS.map(entry => (
                <Chip
                  key={entry}
                  active={kind === entry}
                  onClick={() => setKind(entry)}
                  title={STUDY_KIND_HINT[entry]}
                >
                  {STUDY_KIND_LABEL[entry]}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow
              label="Side"
              title="Which side you study it from. A structure both sides meet has none."
            >
              {COLORS.map(entry => (
                <Chip key={entry} active={color === entry} onClick={() => setColor(entry)}>
                  {COLOR_LABEL[entry]}
                </Chip>
              ))}
            </FilterRow>
          </FilterGrid>

          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            rows={2}
            placeholder="What this study is for, in one line"
            className={`${INPUT} resize-y`}
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={create}
              disabled={busy || name.trim().length === 0}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Create study'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && studies !== null && !adding && <p className="text-xs text-red-400">{error}</p>}

      {studies === null ? (
        <div className="py-16 flex justify-center">
          <Spinner size="w-6 h-6" />
        </div>
      ) : studies.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          Nothing yet — start with the opening you play most, or the structure it reaches.
        </p>
      ) : (
        <>
          <Panel
            id="studies-filters"
            title="Filters"
            meta={
              `${shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}` +
              ` stud${rows.length === 1 ? 'y' : 'ies'}` +
              (narrowed ? ' · narrowed' : '')
            }
            actions={
              narrowed && (
                <button
                  onClick={() => setFilters(NO_STUDY_FILTERS)}
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
                  value={filters.search}
                  onChange={event =>
                    setFilters(current => ({ ...current, search: event.target.value }))
                  }
                  placeholder="Name or what it is for"
                  className="w-full sm:max-w-sm bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600"
                />
              </FilterRow>

              <FilterRow label="Kind">
                <Chip
                  active={filters.kind === null}
                  onClick={() => setFilters(current => ({ ...current, kind: null }))}
                >
                  any
                </Chip>
                {kinds.map(entry => (
                  <Chip
                    key={entry}
                    active={filters.kind === entry}
                    disabled={filters.kind !== entry && (counts.get(entry) ?? 0) === 0}
                    onClick={() =>
                      setFilters(current => ({
                        ...current,
                        kind: current.kind === entry ? null : entry,
                      }))
                    }
                    title={`${counts.get(entry) ?? 0} of them`}
                  >
                    {STUDY_KIND_LABEL[entry]}
                  </Chip>
                ))}
              </FilterRow>
            </FilterGrid>
          </Panel>

          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              Nothing matches that.{' '}
              <button
                onClick={() => setFilters(NO_STUDY_FILTERS)}
                className="text-zinc-300 underline hover:text-zinc-100"
              >
                Clear the finder
              </button>
              .
            </p>
          ) : (
            <div className="border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
              {shown.map(study => (
                <Link
                  key={study.id}
                  href={`/studies/${study.id}`}
                  className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
                >
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ColorDot color={study.color} />
                      <span className="text-sm font-medium text-zinc-100">{study.name}</span>
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                          STUDY_KIND_BADGE[study.kind]
                        }`}
                      >
                        {STUDY_KIND_LABEL[study.kind]}
                      </span>
                    </div>
                    {study.description.length > 0 && (
                      <span className="text-xs text-zinc-500 truncate">{study.description}</span>
                    )}
                  </div>

                  <span className="shrink-0 text-xs text-zinc-600 text-right">
                    {sizeLine(study)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function StudiesPage() {
  return (
    <PageShell title="Studies" wide>
      {user => (
        <Suspense
          fallback={
            <div className="py-16 flex justify-center">
              <Spinner size="w-6 h-6" />
            </div>
          }
        >
          <StudiesBody userId={user.uid} />
        </Suspense>
      )}
    </PageShell>
  )
}
