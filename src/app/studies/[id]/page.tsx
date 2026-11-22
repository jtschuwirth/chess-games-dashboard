'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import BackLink from '@/components/BackLink'
import Chip from '@/components/Chip'
import ColorDot from '@/components/ColorDot'
import GameRow from '@/components/GameRow'
import LinkPicker from '@/components/LinkPicker'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import StatBlockCard from '@/components/StatBlockCard'
import StudyIdeaList from '@/components/StudyIdeaList'
import StudyLinks from '@/components/StudyLinks'
import { DEFAULT_FILTERS } from '@/lib/dashboard-filters'
import { formatMoment } from '@/lib/days'
import { clearDraft, draftSuperseded, readDraft, writeDraft } from '@/lib/draft'
import {
  deleteStudyRecord,
  getGames,
  getModelGames,
  getOpenings,
  getPatterns,
  getStudies,
  updateStudyRecord,
} from '@/lib/firestore'
import { modelGameLabel, modelGameMeta, plyLabel, sortModelGames } from '@/lib/model-game'
import { withFrom } from '@/lib/nav'
import {
  buildOpeningTree,
  formatMoves,
  openingLabel,
  openingRoute,
  routeSteps,
  type RouteStep,
} from '@/lib/opening'
import { DESCRIPTION_LABEL, KIND_BADGE, KIND_LABEL, describedBy } from '@/lib/pattern'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import { computeSplit } from '@/lib/stats'
import { RANKS, RANK_LABEL, emptyIdea, ideasIn, linksIn, moveIdea } from '@/lib/study'
import {
  PANEL_BY_ID,
  STUDY_KINDS,
  STUDY_KIND_BADGE,
  STUDY_KIND_HINT,
  STUDY_KIND_LABEL,
  studiesLeadingTo,
  studyPanelId,
  studyRecordBody,
  studyRecordChanged,
  toggleId,
  withGame,
  withGameRef,
  withRelated,
  withRelatedNote,
  withoutGame,
  withoutRelated,
  type StudyPanelId,
} from '@/lib/studies'
import {
  COLOR_LABEL,
  type Color,
  type GameRecord,
  type ModelGame,
  type NewStudyRecord,
  type OpeningColor,
  type OpeningLine,
  type PatternRecord,
  type StudyIdea,
  type StudyRecord,
} from '@/types/chess'

/** How many games the panel lists before handing you to the dashboard for the rest. */
const SHOWN_GAMES = 8

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

const COLORS: OpeningColor[] = ['any', 'white', 'black']

/** A shape that is not a study is not worth restoring, and must not throw later. */
function isStudy(body: unknown): boolean {
  const study = body as NewStudyRecord
  return Boolean(study) && typeof study.name === 'string' && Array.isArray(study.body?.ideas)
}

function panel(id: StudyPanelId) {
  const found = PANEL_BY_ID.get(id)
  if (!found) throw new Error(`No study panel called ${id}`)
  return found
}

/**
 * What a links panel folds down to. Nothing at all when it is empty: a panel reading
 * `0 links` is a figure saying there is no figure, and the hint inside already says what
 * belongs there.
 */
function linkMeta(count: number, one: string, many: string): string | undefined {
  return count === 0 ? undefined : `${count} ${count === 1 ? one : many}`
}

function StudyDocBody({ userId, studyId }: { userId: string; studyId: string }) {
  /** What is on screen, edited or not. */
  const [study, setStudy] = useState<NewStudyRecord | null>(null)
  /** The study as Firestore last confirmed it, which is what "unsaved" is measured against. */
  const [stored, setStored] = useState<NewStudyRecord | null>(null)
  const [studies, setStudies] = useState<StudyRecord[]>([])
  const [patterns, setPatterns] = useState<PatternRecord[]>([])
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [models, setModels] = useState<ModelGame[]>([])
  /** null while the thousand game documents are still being read. */
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [restored, setRestored] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true

    /*
      What you wrote first, what you played after.

      The study and everything it points at is four reads of a handful of documents; the
      games are a thousand, and the slice derived from them costs a replay of every one.
      Waiting for that before showing a page of your own prose is waiting for the wrong
      thing, so the document renders as soon as it can and the panels that count games
      fill in behind it. The openings list is read fresh for the same reason the studies
      are: these are documents written on a laptop and opened on a phone.
    */
    Promise.all([
      getStudies(userId),
      getPatterns(userId),
      getOpenings(userId, { fresh: true }),
      getModelGames(userId),
    ])
      .then(([loadedStudies, loadedPatterns, loadedOpenings, loadedModels]) => {
        if (!live) return

        const found = loadedStudies.find(entry => entry.id === studyId) ?? null
        if (!found) {
          setMissing(true)
          return
        }

        const body = studyRecordBody(found)

        /*
          A draft on this device usually outranks what Firestore has, because it exists
          only where edits were made and not saved. It is restored rather than offered —
          being asked a question before you can see your own study is worse — unless
          another device has saved since, in which case it is work already moved past.
        */
        const draft = readDraft<NewStudyRecord>('studydoc', userId, studyId, isStudy)
        const superseded = draft !== null && draftSuperseded(draft.editedAt, found.updatedAt)

        if (draft && !superseded && studyRecordChanged(draft.body, body)) {
          setStudy(draft.body)
          setRestored(draft.editedAt)
        } else {
          if (draft) clearDraft('studydoc', userId, studyId)
          setStudy(body)
          setRestored(null)
        }

        setStored(body)
        setStudies(loadedStudies)
        setPatterns(loadedPatterns)
        setOpenings(loadedOpenings)
        setModels(loadedModels)
        setLoadError(null)
      })
      .catch(caught => {
        if (!live) return
        setLoadError(errorText(caught, 'Could not load this study.'))
      })

    getGames(userId)
      .then(loaded => {
        if (live) setGames(loaded)
      })
      // a failed game read costs the panels that count games, not the study
      .catch(() => setGames([]))

    return () => {
      live = false
    }
  }, [userId, studyId, reload])

  /**
   * An edit changes the screen; an effect puts it on the device; a button writes it.
   *
   * The updater form rather than a finished value, for the reason the plan page learned
   * it: handlers in one React batch all read from the same rendered snapshot, so two
   * edits dispatched together would leave only the last.
   */
  const edit = useCallback((update: (current: NewStudyRecord) => NewStudyRecord) => {
    setStudy(current => (current ? update(current) : current))
  }, [])

  const editBody = useCallback(
    (update: (body: NewStudyRecord['body']) => NewStudyRecord['body']) =>
      edit(current => ({ ...current, body: update(current.body) })),
    [edit],
  )

  const setIdea = useCallback(
    (id: string, next: StudyIdea) =>
      editBody(body => ({
        ...body,
        ideas: body.ideas.map(idea => (idea.id === id ? next : idea)),
      })),
    [editBody],
  )

  const removeIdea = useCallback(
    (id: string) =>
      editBody(body => ({ ...body, ideas: body.ideas.filter(idea => idea.id !== id) })),
    [editBody],
  )

  const moveIdeaBy = useCallback(
    (id: string, delta: number) =>
      editBody(body => ({ ...body, ideas: moveIdea(body.ideas, id, delta) })),
    [editBody],
  )

  const addIdea = useCallback(
    (idea: StudyIdea) => editBody(body => ({ ...body, ideas: [...body.ideas, idea] })),
    [editBody],
  )

  const unsaved = study !== null && stored !== null && studyRecordChanged(study, stored)

  useEffect(() => {
    if (study && unsaved) writeDraft('studydoc', userId, studyId, studyRecordBody(study))
  }, [study, unsaved, userId, studyId])

  /** The browser's own warning, for the one exit the draft cannot cover. */
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const tree = useMemo(() => buildOpeningTree(openings), [openings])
  const positionKeys = useMemo(() => positionKeyMap(games ?? []), [games])

  /**
   * Every game that reached any of the saved lines this study covers.
   *
   * The union rather than one line's slice, because a study is allowed to cover several
   * ways of reaching the same thing — and deduplicated by id, because a game reaching two
   * of them is one game. Each line's own slice is the dashboard's, so what is counted here
   * and what the dashboard shows for that line can never disagree.
   */
  const slice = useMemo(() => {
    if (!study || study.openingIds.length === 0 || games === null) return []

    const seen = new Set<string>()
    const out: GameRecord[] = []
    for (const openingId of study.openingIds) {
      for (const game of scopeGames(games, tree, positionKeys, {
        ...DEFAULT_FILTERS,
        opening: openingId,
      })) {
        if (seen.has(game.id)) continue
        seen.add(game.id)
        out.push(game)
      }
    }
    return out.sort((a, b) => b.playedAt - a.playedAt)
  }, [study, games, tree, positionKeys])

  const split = useMemo(() => computeSplit(slice), [slice])
  const shown = useMemo(() => slice.slice(0, SHOWN_GAMES), [slice])

  const routesByGame = useMemo(() => {
    const map = new Map<string, RouteStep[]>()
    for (const game of shown) {
      const steps = routeSteps(openingRoute(tree, game, positionKeys.get(game.id) ?? new Map()))
      if (steps.length > 0) map.set(game.id, steps)
    }
    return map
  }, [shown, tree, positionKeys])

  /** The other end of `related`, derived: every study that says it runs into this one. */
  const leadingHere = useMemo(
    () => studiesLeadingTo(studies, studyId),
    [studies, studyId],
  )

  const byId = useMemo(() => new Map(studies.map(entry => [entry.id, entry])), [studies])
  const modelsById = useMemo(() => new Map(models.map(game => [game.id, game])), [models])

  async function commit() {
    if (!study) return

    setSaving(true)
    setError(null)
    const body = studyRecordBody(study)
    try {
      const savedAt = await updateStudyRecord(userId, studyId, study)
      setStored(body)
      // so a draft written after this save is not mistaken for one the save moved past
      setStudies(current =>
        current.map(entry =>
          entry.id === studyId ? { ...entry, ...body, id: studyId, updatedAt: savedAt } : entry,
        ),
      )
      clearDraft('studydoc', userId, studyId)
      setRestored(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save this study — your changes are still here.'))
    } finally {
      setSaving(false)
    }
  }

  /** Throw the draft away and take what Firestore has. */
  function discard() {
    clearDraft('studydoc', userId, studyId)
    setRestored(null)
    setReload(count => count + 1)
  }

  async function remove() {
    setSaving(true)
    try {
      await deleteStudyRecord(userId, studyId)
      clearDraft('studydoc', userId, studyId)
      window.location.href = '/studies'
    } catch (caught) {
      setError(errorText(caught, 'Could not delete this study.'))
      setSaving(false)
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={() => setReload(n => n + 1)} />

  if (missing) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <p className="text-sm text-zinc-500">That study is not there any more.</p>
        <Link href="/studies" className="text-sm text-zinc-300 underline">
          Back to studies
        </Link>
      </div>
    )
  }

  if (!study) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  /** Your side first: this is your study, and your plans are the ones you reread. */
  const sides: Color[] = study.color === 'black' ? ['black', 'white'] : ['white', 'black']
  const here = `/studies/${studyId}`

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback={{ href: '/studies', label: 'All studies' }} />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex flex-col gap-1.5">
          {editing ? (
            <input
              value={study.name}
              onChange={event => edit(current => ({ ...current, name: event.target.value }))}
              className={`${INPUT} text-lg`}
            />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <ColorDot color={study.color} size="w-2.5 h-2.5" />
              <h2 className="text-xl font-semibold text-zinc-100">{study.name}</h2>
              <span
                className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                  STUDY_KIND_BADGE[study.kind]
                }`}
              >
                {STUDY_KIND_LABEL[study.kind]}
              </span>
            </div>
          )}

          {editing ? (
            <>
              <div className="flex gap-1.5 flex-wrap">
                {STUDY_KINDS.map(entry => (
                  <Chip
                    key={entry}
                    active={study.kind === entry}
                    onClick={() => edit(current => ({ ...current, kind: entry }))}
                    title={STUDY_KIND_HINT[entry]}
                  >
                    {STUDY_KIND_LABEL[entry]}
                  </Chip>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {COLORS.map(entry => (
                  <Chip
                    key={entry}
                    active={study.color === entry}
                    onClick={() => edit(current => ({ ...current, color: entry }))}
                  >
                    {COLOR_LABEL[entry]}
                  </Chip>
                ))}
              </div>
              <textarea
                value={study.description}
                onChange={event =>
                  edit(current => ({ ...current, description: event.target.value }))
                }
                rows={2}
                placeholder="What this study is for, in one line"
                className={`${INPUT} resize-y`}
              />
            </>
          ) : (
            study.description.length > 0 && (
              <p className="text-sm text-zinc-400 max-w-2xl">{study.description}</p>
            )
          )}
        </div>

        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap justify-end">
          {editing && (
            <button
              onClick={() => (confirming ? remove() : setConfirming(true))}
              className={`text-xs transition-colors ${
                confirming ? 'text-red-400' : 'text-zinc-600 hover:text-red-400'
              }`}
            >
              {confirming ? 'Really delete?' : 'Delete'}
            </button>
          )}

          <button
            onClick={() => setEditing(current => !current)}
            title={editing ? 'Stop editing and read it back' : 'Write on this study'}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              editing
                ? 'bg-zinc-800 text-zinc-100 border-zinc-600'
                : 'bg-transparent text-zinc-400 border-zinc-800 hover:text-zinc-100 hover:border-zinc-600'
            }`}
          >
            {editing ? 'Done editing' : 'Edit'}
          </button>

          {unsaved && (
            <button
              onClick={discard}
              title="Throw away everything since the last save and reload the stored study"
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Discard
            </button>
          )}

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
        </div>
      </div>

      {restored !== null && (
        <p className="text-xs text-amber-400">
          Unsaved changes from {formatMoment(restored)} were picked up from this device. Save
          them, or discard to go back to the stored study.
        </p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <Panel id={studyPanelId('overview')} title={panel('overview').title}>
        <StudyIdeaList
          ideas={ideasIn(study.body, 'overview')}
          editing={editing}
          hint={panel('overview').hint}
          placeholder="White gives up the centre pawn for pieces and an initiative"
          addLabel="+ Add a line"
          onChange={setIdea}
          onRemove={removeIdea}
          onMove={moveIdeaBy}
          onAdd={() => addIdea(emptyIdea('overview'))}
        />
      </Panel>

      <Panel id={studyPanelId('plans')} title={panel('plans').title}>
        <div className="grid lg:grid-cols-2 gap-x-6 gap-y-5">
          {sides.map(side => (
            <div key={side} className="flex flex-col gap-4">
              <h3 className="text-xs uppercase tracking-wide text-zinc-500">
                {COLOR_LABEL[side]}
                {study.color === side && <span className="text-violet-400"> · you</span>}
              </h3>

              {RANKS.map(rank => {
                const ideas = ideasIn(study.body, 'plans', side, rank)
                // a sideline nobody has written is not worth a heading of its own
                if (!editing && ideas.every(idea => idea.text.trim().length === 0)) {
                  return rank === 'main' ? (
                    <p key={rank} className="text-sm text-zinc-600">
                      {panel('plans').hint}
                    </p>
                  ) : null
                }

                return (
                  <div key={rank} className="flex flex-col gap-2">
                    <h4 className="text-[11px] uppercase tracking-wide text-zinc-600">
                      {RANK_LABEL[rank]}
                    </h4>
                    <StudyIdeaList
                      ideas={ideas}
                      editing={editing}
                      hint=""
                      placeholder={
                        rank === 'main'
                          ? 'Push the isolani to d5 at the right moment, or sit on it with Nd4'
                          : 'Trade into an ending where the pawn is simply weak'
                      }
                      addLabel="+ Add a plan"
                      onChange={setIdea}
                      onRemove={removeIdea}
                      onMove={moveIdeaBy}
                      onAdd={() => addIdea(emptyIdea('plans', side, rank))}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </Panel>

      {/*
        The patterns that apply here, which is the half of a study you can actually train:
        every row is the document the patterns page holds, so opening one gets the board,
        the boundaries and the drill.

        The link is stored on the **study** — `patternIds` — unlike the opening write-up's,
        which lives on the pattern because the pattern form had it first. So it saves with
        everything else here rather than at once, and there is still one answer in one
        place.
      */}
      <Panel
        id={studyPanelId('patterns')}
        title={panel('patterns').title}
        meta={study.patternIds.length > 0 ? `${study.patternIds.length} linked` : undefined}
        actions={
          <Link href="/patterns" className="text-xs text-zinc-500 hover:text-zinc-200">
            All patterns →
          </Link>
        }
      >
        {study.patternIds.length === 0 ? (
          !editing && <p className="text-sm text-zinc-600">{panel('patterns').hint}</p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
            {study.patternIds.map(id => {
              const pattern = patterns.find(entry => entry.id === id)
              if (!pattern) {
                return (
                  <span key={id} className="px-4 py-3 bg-zinc-900 text-xs text-zinc-600">
                    A pattern that is no longer there.
                    {editing && (
                      <button
                        onClick={() =>
                          edit(current => ({
                            ...current,
                            patternIds: toggleId(current.patternIds, id),
                          }))
                        }
                        className="ml-2 text-zinc-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </span>
                )
              }

              return (
                <div
                  key={id}
                  className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
                >
                  <Link
                    href={withFrom(`/patterns/${id}`, here)}
                    className="flex items-center gap-3 min-w-0 flex-1"
                  >
                    <span
                      className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                        KIND_BADGE[pattern.kind]
                      }`}
                    >
                      {KIND_LABEL[pattern.kind]}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-zinc-200 truncate">
                      {pattern.name}
                    </span>
                    {/* the finder's own words, so a row here and a chip there match */}
                    <span className="shrink-0 text-xs text-zinc-600">
                      {DESCRIPTION_LABEL[describedBy(pattern)]}
                    </span>
                  </Link>
                  {editing && (
                    <button
                      onClick={() =>
                        edit(current => ({
                          ...current,
                          patternIds: toggleId(current.patternIds, id),
                        }))
                      }
                      className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {editing && (
          <LinkPicker
            items={patterns.map(pattern => ({
              id: pattern.id,
              label: pattern.name,
              meta: `${KIND_LABEL[pattern.kind]}${pattern.motif ? ` · ${pattern.motif}` : ''}`,
            }))}
            selected={study.patternIds}
            onToggle={id =>
              edit(current => ({ ...current, patternIds: toggleId(current.patternIds, id) }))
            }
            addLabel="+ Link a pattern"
            placeholder="Find a pattern"
            empty="Nothing written up yet — the patterns page is where one starts."
          />
        )}
      </Panel>

      {/*
        The link that makes this a section rather than a pile of pages: the Panov enters
        the isolani, so it says so here and the study of the structure is one press away
        instead of being written out again inside the opening.

        The note is the whole of it — "after 5…e6 6.Nf3 Be7 7.cxd5" is which line gets
        there, and that sentence is the thing you came back for.
      */}
      <Panel
        id={studyPanelId('leads')}
        title={panel('leads').title}
        meta={
          study.related.length > 0 || leadingHere.length > 0
            ? [
                study.related.length > 0 ? `${study.related.length} out` : '',
                leadingHere.length > 0 ? `${leadingHere.length} in` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
      >
        {study.related.length === 0 ? (
          !editing && <p className="text-sm text-zinc-600">{panel('leads').hint}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {study.related.map(ref => {
              const target = byId.get(ref.studyId)

              return (
                <div
                  key={ref.studyId}
                  className="border border-zinc-800 rounded-lg px-3 py-2.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2">
                    {target ? (
                      <Link
                        href={withFrom(`/studies/${ref.studyId}`, here)}
                        className="min-w-0 flex items-center gap-2 flex-1"
                      >
                        <ColorDot color={target.color} />
                        <span className="text-sm text-zinc-200 truncate">{target.name}</span>
                        <span
                          className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                            STUDY_KIND_BADGE[target.kind]
                          }`}
                        >
                          {STUDY_KIND_LABEL[target.kind]}
                        </span>
                      </Link>
                    ) : (
                      <span className="flex-1 text-xs text-zinc-600">
                        A study that is no longer there.
                      </span>
                    )}
                    {editing && (
                      <button
                        onClick={() => edit(current => withoutRelated(current, ref.studyId))}
                        className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {editing ? (
                    <input
                      value={ref.note ?? ''}
                      onChange={event =>
                        edit(current => withRelatedNote(current, ref.studyId, event.target.value))
                      }
                      placeholder="Which line gets there — after 5…e6 6.Nf3 Be7 7.cxd5"
                      className={`${INPUT} text-xs`}
                    />
                  ) : (
                    ref.note && <p className="text-xs text-zinc-500">{ref.note}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {editing && (
          <LinkPicker
            items={studies
              .filter(entry => entry.id !== studyId)
              .map(entry => ({
                id: entry.id,
                label: entry.name,
                meta: `${STUDY_KIND_LABEL[entry.kind]}${
                  entry.description ? ` · ${entry.description}` : ''
                }`,
              }))}
            selected={study.related.map(ref => ref.studyId)}
            onToggle={id =>
              edit(current =>
                current.related.some(ref => ref.studyId === id)
                  ? withoutRelated(current, id)
                  : withRelated(current, id),
              )
            }
            addLabel="+ Link another study"
            placeholder="Find a study"
            empty="This is your only study so far."
          />
        )}

        {/*
          The other end, derived rather than stored: every study that says it runs into
          this one, carrying the note it wrote about how. Which is what makes a structure
          study worth having — the isolani page lists the openings that reach it without
          any of them being typed in here.
        */}
        {leadingHere.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">
              Reached from
            </span>
            {leadingHere.map(({ study: from, note }) => (
              <Link
                key={from.id}
                href={withFrom(`/studies/${from.id}`, here)}
                className="flex items-baseline gap-2 text-xs hover:text-zinc-200 transition-colors"
              >
                <span className="text-zinc-300">{from.name}</span>
                {note && <span className="text-zinc-600 min-w-0 truncate">{note}</span>}
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {/*
        The games showing it played, each opened where it is cited for rather than at move
        one: the whole reason a citation carries a ply is that a model game is here for the
        structure it reaches on move 11.
      */}
      <Panel
        id={studyPanelId('models')}
        title={panel('models').title}
        meta={study.games.length > 0 ? `${study.games.length} cited` : undefined}
        actions={
          <Link href="/models" className="text-xs text-zinc-500 hover:text-zinc-200">
            All model games →
          </Link>
        }
      >
        {study.games.length === 0 ? (
          !editing && <p className="text-sm text-zinc-600">{panel('models').hint}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {study.games.map(ref => {
              const game = modelsById.get(ref.gameId)
              const at = ref.ply ?? game?.line.startPly ?? 0

              return (
                <div
                  key={ref.gameId}
                  className="border border-zinc-800 rounded-lg px-3 py-2.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {game ? (
                      <Link
                        href={withFrom(`/models/${ref.gameId}?ply=${at}`, here)}
                        className="min-w-0 flex-1 flex flex-col"
                      >
                        <span className="text-sm text-zinc-200 truncate">
                          {modelGameLabel(game)}
                        </span>
                        <span className="text-[11px] text-zinc-600 truncate">
                          {modelGameMeta(game)}
                          {modelGameMeta(game) && ' · '}
                          opens on {plyLabel(game, at)}
                        </span>
                      </Link>
                    ) : (
                      <span className="flex-1 text-xs text-zinc-600">
                        A model game that is no longer there.
                      </span>
                    )}

                    {editing && (
                      <>
                        {/*
                          Where the board opens, in plies, because that is the quantity
                          and because the game's own page is where you set it by pointing
                          at a move. Cleared means "wherever the game itself opens",
                          which is not the same thing as ply 0.
                        */}
                        <input
                          value={ref.ply ?? ''}
                          onChange={event => {
                            const ply = Number(event.target.value)
                            edit(current =>
                              withGameRef(current, ref.gameId, {
                                ply:
                                  event.target.value.trim().length > 0 && Number.isFinite(ply)
                                    ? ply
                                    : undefined,
                              }),
                            )
                          }}
                          inputMode="numeric"
                          title="Which half-move the board opens on. Empty uses the game's own."
                          placeholder="ply"
                          className={`${INPUT} w-16 text-xs shrink-0`}
                        />
                        <button
                          onClick={() => edit(current => withoutGame(current, ref.gameId))}
                          className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>

                  {editing ? (
                    <input
                      value={ref.note ?? ''}
                      onChange={event =>
                        edit(current =>
                          withGameRef(current, ref.gameId, { note: event.target.value }),
                        )
                      }
                      placeholder="Why it is here — the model treatment with the knight on e5"
                      className={`${INPUT} text-xs`}
                    />
                  ) : (
                    ref.note && <p className="text-xs text-zinc-500">{ref.note}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {editing && (
          <LinkPicker
            items={sortModelGames(models).map(game => ({
              id: game.id,
              label: modelGameLabel(game),
              meta: [modelGameMeta(game), game.description].filter(Boolean).join(' — '),
            }))}
            selected={study.games.map(ref => ref.gameId)}
            onToggle={id =>
              edit(current =>
                current.games.some(ref => ref.gameId === id)
                  ? withoutGame(current, id)
                  : withGame(current, id, modelsById.get(id)?.line.startPly),
              )
            }
            addLabel="+ Cite a model game"
            placeholder="Find a game"
            empty="Nothing brought in yet — the model games page is where one starts."
          />
        )}
      </Panel>

      {/*
        Which saved lines this study covers. It is what makes the two panels below
        possible at all — your own games here are the dashboard's slice for those lines,
        read off what is already stored.
      */}
      <Panel
        id={studyPanelId('openings')}
        title={panel('openings').title}
        meta={
          study.openingIds.length > 0
            ? `${study.openingIds.length} line${study.openingIds.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={
          <Link href="/openings" className="text-xs text-zinc-500 hover:text-zinc-200">
            All openings →
          </Link>
        }
      >
        {study.openingIds.length === 0 ? (
          !editing && <p className="text-sm text-zinc-600">{panel('openings').hint}</p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
            {study.openingIds.map(id => {
              const opening = openings.find(entry => entry.id === id)

              return (
                <div
                  key={id}
                  className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
                >
                  {opening ? (
                    <Link
                      href={withFrom(`/openings/${id}`, here)}
                      className="min-w-0 flex-1 flex flex-col"
                    >
                      <span className="flex items-center gap-2">
                        <ColorDot color={opening.color} />
                        <span className="text-sm text-zinc-200 truncate">{opening.name}</span>
                      </span>
                      <span className="text-xs text-zinc-600 font-mono truncate">
                        {formatMoves(opening.moves)}
                      </span>
                    </Link>
                  ) : (
                    <span className="flex-1 text-xs text-zinc-600">
                      A saved line that is no longer there.
                    </span>
                  )}
                  {editing && (
                    <button
                      onClick={() =>
                        edit(current => ({
                          ...current,
                          openingIds: toggleId(current.openingIds, id),
                        }))
                      }
                      className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {editing && (
          <LinkPicker
            items={openings.map(opening => ({
              id: opening.id,
              label: openingLabel(opening),
              meta: formatMoves(opening.moves),
            }))}
            selected={study.openingIds}
            onToggle={id =>
              edit(current => ({ ...current, openingIds: toggleId(current.openingIds, id) }))
            }
            addLabel="+ Link a saved line"
            placeholder="Find a line"
            empty="Nothing saved yet — the openings page is where a line starts."
          />
        )}
      </Panel>

      {study.openingIds.length > 0 && (
        <Panel
          id={studyPanelId('results')}
          title={panel('results').title}
          meta={
            games === null ? (
              'reading…'
            ) : slice.length > 0 ? (
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  {slice.length} game{slice.length === 1 ? '' : 's'} · {split.overall.score}%
                </span>
                <span className="flex h-1.5 w-20 rounded-full overflow-hidden bg-zinc-800">
                  <span className="bg-emerald-500" style={{ width: `${split.overall.winPct}%` }} />
                  <span className="bg-zinc-500" style={{ width: `${split.overall.drawPct}%` }} />
                  <span className="bg-red-500" style={{ width: `${split.overall.lossPct}%` }} />
                </span>
              </span>
            ) : undefined
          }
          actions={
            slice.length > 0 ? (
              <Link
                href={`/dashboard?opening=${study.openingIds[0]}`}
                className="text-xs text-zinc-500 hover:text-zinc-200"
              >
                In the dashboard →
              </Link>
            ) : undefined
          }
        >
          {games === null ? (
            <p className="text-sm text-zinc-600 flex items-center gap-2">
              <Spinner size="w-3.5 h-3.5" /> Reading your games…
            </p>
          ) : slice.length === 0 ? (
            <p className="text-sm text-zinc-600">{panel('results').hint}</p>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <StatBlockCard label="Overall" stats={split.overall} />
                <StatBlockCard label={COLOR_LABEL.white} stats={split.white} />
                <StatBlockCard label={COLOR_LABEL.black} stats={split.black} />
              </div>

              <div className="-mx-5 flex flex-col divide-y divide-zinc-800 border-y border-zinc-800">
                {shown.map(game => (
                  <GameRow
                    key={game.id}
                    userId={userId}
                    game={game}
                    route={routesByGame.get(game.id) ?? []}
                    href={withFrom(`/games/${game.id}`, here)}
                  />
                ))}
              </div>
            </>
          )}
        </Panel>
      )}

      {/*
        Line studies sit above References because they are not the same kind of link. This
        is the study of the moves — the place you open mid-game to see a variation worked
        out — where a reference is something you read once.
      */}
      <Panel
        id={studyPanelId('lines')}
        title={panel('lines').title}
        meta={linkMeta(linksIn(study.body, 'lines').length, 'study', 'studies')}
      >
        <StudyLinks
          links={study.body.links}
          section="lines"
          editing={editing}
          hint={panel('lines').hint}
          placeholder="https://lichess.org/study/…"
          embed
          onChange={links => editBody(body => ({ ...body, links }))}
        />
      </Panel>

      <Panel
        id={studyPanelId('references')}
        title={panel('references').title}
        meta={linkMeta(linksIn(study.body, 'references').length, 'link', 'links')}
      >
        <StudyLinks
          links={study.body.links}
          section="references"
          editing={editing}
          hint={panel('references').hint}
          onChange={links => editBody(body => ({ ...body, links }))}
        />
      </Panel>
    </div>
  )
}

export default function StudyPage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Study" wide>
      {user => (
        <Suspense
          fallback={
            <div className="py-16 flex justify-center">
              <Spinner size="w-6 h-6" />
            </div>
          }
        >
          <StudyDocBody key={params.id} userId={user.uid} studyId={params.id} />
        </Suspense>
      )}
    </PageShell>
  )
}
