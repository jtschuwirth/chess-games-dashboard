'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import GameRow from '@/components/GameRow'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import StatBlockCard from '@/components/StatBlockCard'
import StudyIdeaList from '@/components/StudyIdeaList'
import StudyLinks from '@/components/StudyLinks'
import { formatMoment } from '@/lib/days'
import { DEFAULT_FILTERS } from '@/lib/dashboard-filters'
import { clearDraft, draftSuperseded, readDraft, writeDraft } from '@/lib/draft'
import { getGames, getOpenings, getPatterns, saveStudy } from '@/lib/firestore'
import {
  buildOpeningTree,
  findPath,
  formatMoves,
  gameMatchesNode,
  matchingPath,
  openingLabel,
} from '@/lib/opening'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import { computeSplit, computeStats } from '@/lib/stats'
import {
  RANKS,
  RANK_LABEL,
  SECTION_BY_ID,
  emptyIdea,
  emptyStudy,
  ideasIn,
  linksIn,
  moveIdea,
  panelId,
  studyBody,
  studyChanged,
} from '@/lib/study'
import type { StatBlock } from '@/lib/stats'
import type {
  Color,
  GameRecord,
  OpeningColor,
  OpeningLine,
  OpeningStudy,
  PatternRecord,
  StudyIdea,
} from '@/types/chess'

/** How many games the panel lists before handing you to the dashboard for the rest. */
const SHOWN_GAMES = 8

const COLOR_BADGE: Record<OpeningColor, string> = {
  any: 'Either colour',
  white: 'As White',
  black: 'As Black',
}

/** A shape that is not a study is not worth restoring, and must not throw later. */
function isStudy(body: unknown): boolean {
  return Boolean(body) && Array.isArray((body as OpeningStudy)?.ideas)
}

function section(id: string) {
  const found = SECTION_BY_ID.get(id as never)
  if (!found) throw new Error(`No study section called ${id}`)
  return found
}

/**
 * What a links panel folds down to.
 *
 * Nothing at all when it is empty: a panel reading `0 links` is a figure saying there is
 * no figure, and the hint inside already says what belongs there.
 */
function linkMeta(count: number, one: string, many: string): string | undefined {
  return count === 0 ? undefined : `${count} ${count === 1 ? one : many}`
}

function StudyBody({ userId, openingId }: { userId: string; openingId: string }) {
  const [openings, setOpenings] = useState<OpeningLine[] | null>(null)
  const [patterns, setPatterns] = useState<PatternRecord[]>([])
  /** null while the thousand game documents are still being read. */
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  /** What is on screen, edited or not. */
  const [study, setStudy] = useState<OpeningStudy | null>(null)
  /** The study as Firestore last confirmed it, which is what "unsaved" is measured against. */
  const [stored, setStored] = useState<OpeningStudy | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  /** When a draft restored from this device was last edited, or null if there was none. */
  const [restored, setRestored] = useState<number | null>(null)

  useEffect(() => {
    let live = true

    /*
      What you wrote first, what you played after.

      The study is two reads of sixty-five and four documents; the games are a thousand,
      and everything derived from them costs a replay of every one. Waiting for that
      before showing a page of your own prose is waiting for the wrong thing, so the
      document renders as soon as it can and the panels that count games fill in behind
      it. Same split as the openings list, for the same reason.

      The openings read is the one `fresh` read in the app besides plans: this is a
      document you write on a laptop and read on a phone, so a cache-first read would
      show whatever this device last saw. The dashboard's read stays cache-first.
    */
    Promise.all([getOpenings(userId, { fresh: true }), getPatterns(userId)])
      .then(([loadedOpenings, loadedPatterns]) => {
        if (!live) return

        const found = loadedOpenings.find(entry => entry.id === openingId) ?? null
        const body = found ? studyBody(found.study ?? emptyStudy()) : null

        /*
          A draft on this device usually outranks what Firestore has, because it exists
          only where edits were made and not saved. It is restored rather than offered —
          being asked a question before you can see your own study is worse — unless
          another device has saved since, in which case it is work already moved past.
        */
        const draft = found
          ? readDraft<OpeningStudy>('study', userId, openingId, isStudy)
          : null
        const superseded =
          draft !== null && draftSuperseded(draft.editedAt, found?.updatedAt)

        if (found && draft && body && !superseded && studyChanged(draft.body, body)) {
          setStudy(draft.body)
          setRestored(draft.editedAt)
        } else {
          if (draft) clearDraft('study', userId, openingId)
          setStudy(body ?? emptyStudy())
          setRestored(null)
        }

        setStored(body)
        setOpenings(loadedOpenings)
        setPatterns(loadedPatterns)
        setMissing(found === null)
        setError(null)
      })
      .catch(caught => {
        if (!live) return
        setError(errorText(caught, 'Could not load this opening.'))
      })

    getGames(userId)
      .then(loaded => {
        if (live) setGames(loaded)
      })
      // a failed game read costs the panels that count games, not the study
      .catch(() => {})

    return () => {
      live = false
    }
  }, [userId, openingId, reload])

  const opening = openings?.find(entry => entry.id === openingId) ?? null

  /**
   * An edit changes the screen; an effect puts it on the device; a button writes it.
   *
   * The updater form rather than a finished value, for the reason the plan page learned
   * it: handlers in one React batch all read from the same rendered snapshot, so two
   * edits dispatched together would leave only the last.
   */
  const edit = useCallback((update: (current: OpeningStudy) => OpeningStudy) => {
    setStudy(current => (current ? update(current) : current))
  }, [])

  const setIdea = useCallback(
    (id: string, next: StudyIdea) =>
      edit(current => ({
        ...current,
        ideas: current.ideas.map(idea => (idea.id === id ? next : idea)),
      })),
    [edit],
  )

  const removeIdea = useCallback(
    (id: string) =>
      edit(current => ({ ...current, ideas: current.ideas.filter(idea => idea.id !== id) })),
    [edit],
  )

  const move = useCallback(
    (id: string, delta: number) =>
      edit(current => ({ ...current, ideas: moveIdea(current.ideas, id, delta) })),
    [edit],
  )

  const addIdea = useCallback(
    (idea: StudyIdea) => edit(current => ({ ...current, ideas: [...current.ideas, idea] })),
    [edit],
  )

  const unsaved = study !== null && stored !== null && studyChanged(study, stored)

  useEffect(() => {
    if (study && unsaved) writeDraft('study', userId, openingId, studyBody(study))
  }, [study, unsaved, userId, openingId])

  /** The browser's own warning, for the one exit the draft cannot cover. */
  useEffect(() => {
    if (!unsaved) return

    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  /** One write, for everything since the last one. */
  async function commit() {
    if (!study) return

    setSaving(true)
    setError(null)

    const body = studyBody(study)
    try {
      const savedAt = await saveStudy(userId, openingId, study)
      setStored(body)
      // so a draft written after this save is not mistaken for one the save moved past
      setOpenings(current =>
        (current ?? []).map(entry =>
          entry.id === openingId ? { ...entry, study: body, updatedAt: savedAt } : entry,
        ),
      )
      clearDraft('study', userId, openingId)
      setRestored(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save this study — your changes are still here.'))
    } finally {
      setSaving(false)
    }
  }

  /** Throw the draft away and take what Firestore has. */
  function discard() {
    clearDraft('study', userId, openingId)
    setRestored(null)
    setReload(count => count + 1)
  }

  const tree = useMemo(() => buildOpeningTree(openings ?? []), [openings])
  const positionKeys = useMemo(() => positionKeyMap(games ?? []), [games])

  const path = useMemo(() => findPath(tree, openingId), [tree, openingId])
  const node = path[path.length - 1] ?? null

  /** Every game that reached this line or anything under it. The dashboard's own slice. */
  const slice = useMemo(
    () =>
      scopeGames(games ?? [], tree, positionKeys, { ...DEFAULT_FILTERS, opening: openingId }),
    [games, tree, positionKeys, openingId],
  )

  const split = useMemo(() => computeSplit(slice), [slice])

  /** One row per sub-variation, measured inside this slice — the dashboard's breakdown. */
  const variants = useMemo(() => {
    if (!node) return [] as { opening: OpeningLine; stats: StatBlock }[]

    return node.children
      .map(child => ({
        opening: child.opening,
        stats: computeStats(
          slice.filter(game =>
            gameMatchesNode(game, positionKeys.get(game.id) ?? new Set(), child),
          ),
        ),
      }))
      .sort((a, b) => b.stats.total - a.stats.total)
  }, [node, slice, positionKeys])

  const shown = useMemo(() => slice.slice(0, SHOWN_GAMES), [slice])

  const linesByGame = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const game of shown) {
      const nodes = matchingPath(tree, game, positionKeys.get(game.id) ?? new Set())
      if (nodes.length > 0) map.set(game.id, nodes.map(entry => entry.opening.name))
    }
    return map
  }, [shown, tree, positionKeys])

  /** Patterns already naming this opening — ideas you have written up somewhere else. */
  const patternsHere = useMemo(
    () => patterns.filter(pattern => pattern.openingIds.includes(openingId)),
    [patterns, openingId],
  )

  if (error && openings === null && !missing) {
    return <LoadError message={error} onRetry={() => setReload(n => n + 1)} />
  }

  if (missing) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <p className="text-sm text-zinc-500">That opening is not there any more.</p>
        <Link href="/openings" className="text-sm text-zinc-300 underline">
          Back to openings
        </Link>
      </div>
    )
  }

  if (!opening || !study) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  /** Your side first: this is your repertoire, and your plans are the ones you reread. */
  const sides: Color[] = opening.color === 'black' ? ['black', 'white'] : ['white', 'black']
  const dashboard = `/dashboard?opening=${openingId}`

  return (
    <div className="flex flex-col gap-4">
      <Link href="/openings" className="text-sm text-zinc-500 hover:text-zinc-300 self-start">
        ← All openings
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {path.length > 1 && (
            <p className="text-xs text-zinc-600 mb-1 flex flex-wrap items-center gap-1">
              {path.slice(0, -1).map(ancestor => (
                <span key={ancestor.opening.id} className="flex items-center gap-1">
                  <Link
                    href={`/openings/${ancestor.opening.id}`}
                    className="hover:text-zinc-300 transition-colors"
                  >
                    {ancestor.opening.name}
                  </Link>
                  <span className="text-zinc-700">›</span>
                </span>
              ))}
            </p>
          )}

          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-zinc-100">{opening.name}</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
              {COLOR_BADGE[opening.color]}
            </span>
          </div>

          <p className="text-xs text-zinc-500 font-mono mt-1 break-words">
            {formatMoves(opening.moves)}
          </p>
        </div>

        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap justify-end">
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

          {/* always here rather than appearing with the first edit, and its label is the
              state of the study — the same control the plan page settled on */}
          <button
            onClick={commit}
            disabled={!unsaved || saving}
            title={
              unsaved ? 'Write every change since the last save, in one go' : 'Everything here is saved'
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

      <Panel id={panelId('overview')} title={section('overview').title}>
        <StudyIdeaList
          ideas={ideasIn(study, 'overview')}
          editing={editing}
          hint={section('overview').hint}
          placeholder="Passive approach for White to fight for an advantage"
          addLabel="+ Add a line"
          onChange={setIdea}
          onRemove={removeIdea}
          onMove={move}
          onAdd={() => addIdea(emptyIdea('overview'))}
        />
      </Panel>

      <Panel
        id={panelId('plans')}
        title={section('plans').title}
        meta={
          patternsHere.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1">
              {patternsHere.map(pattern => (
                <Link
                  key={pattern.id}
                  href={`/patterns/${pattern.id}`}
                  title="A pattern that names this opening"
                  className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950/60 text-[11px] text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
                >
                  {pattern.name}
                </Link>
              ))}
            </span>
          ) : undefined
        }
      >
        <div className="grid lg:grid-cols-2 gap-x-6 gap-y-5">
          {sides.map(side => (
            <div key={side} className="flex flex-col gap-4">
              <h3 className="text-xs uppercase tracking-wide text-zinc-500">
                {side === 'white' ? 'White' : 'Black'}
                {opening.color === side && <span className="text-violet-400"> · you</span>}
              </h3>

              {RANKS.map(rank => {
                const ideas = ideasIn(study, 'plans', side, rank)
                // a sideline nobody has written is not worth a heading of its own
                if (!editing && ideas.every(idea => idea.text.trim().length === 0)) {
                  return rank === 'main' ? (
                    <p key={rank} className="text-sm text-zinc-600">
                      {section('plans').hint}
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
                          ? 'Put pressure on d4 with Nc6, Bg4 and Qb3'
                          : 'Stop them recapturing on d4 by pinning c3 with Qa5'
                      }
                      addLabel="+ Add a plan"
                      onChange={setIdea}
                      onRemove={removeIdea}
                      onMove={move}
                      onAdd={() => addIdea(emptyIdea('plans', side, rank))}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        id={panelId('variants')}
        title={section('variants').title}
        meta={
          variants.length > 0
            ? `${variants.length} sub-variation${variants.length === 1 ? '' : 's'}`
            : undefined
        }
      >
        {variants.length === 0 ? (
          <p className="text-sm text-zinc-600">{section('variants').hint}</p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
            {variants.map(variant => (
              <Link
                key={variant.opening.id}
                href={`/openings/${variant.opening.id}`}
                className="flex items-center gap-4 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-sm text-zinc-200 truncate">
                    {variant.opening.name}
                  </span>
                  <span className="block text-xs text-zinc-600 font-mono truncate">
                    {formatMoves(variant.opening.moves)}
                  </span>
                </div>

                <div className="shrink-0 w-28 flex flex-col gap-1 items-end">
                  <span className="text-xs text-zinc-500 tabular-nums">
                    {games === null ? (
                      <span className="text-zinc-700">—</span>
                    ) : (
                      <>
                        {variant.stats.total} game{variant.stats.total === 1 ? '' : 's'}
                        {variant.stats.total > 0 && ` · ${variant.stats.score}%`}
                      </>
                    )}
                  </span>
                  <span className="flex h-1.5 w-full rounded-full overflow-hidden bg-zinc-800">
                    <span
                      className="bg-emerald-500"
                      style={{ width: `${variant.stats.winPct}%` }}
                    />
                    <span className="bg-zinc-500" style={{ width: `${variant.stats.drawPct}%` }} />
                    <span className="bg-red-500" style={{ width: `${variant.stats.lossPct}%` }} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        id={panelId('games')}
        title={section('games').title}
        startFolded
        meta={
          games === null
            ? 'reading…'
            : slice.length > 0
              ? `${slice.length} game${slice.length === 1 ? '' : 's'} · ${split.overall.score}%`
              : undefined
        }
        actions={
          slice.length > 0 ? (
            <Link href={dashboard} className="text-xs text-zinc-500 hover:text-zinc-200">
              All {slice.length} in the dashboard →
            </Link>
          ) : undefined
        }
      >
        {games === null ? (
          <p className="text-sm text-zinc-600 flex items-center gap-2">
            <Spinner size="w-3.5 h-3.5" /> Reading your games…
          </p>
        ) : slice.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Nothing here yet — {section('games').hint.toLowerCase()}
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <StatBlockCard label="Overall" stats={split.overall} />
              <StatBlockCard label="As White" stats={split.white} />
              <StatBlockCard label="As Black" stats={split.black} />
            </div>

            <div className="-mx-5 flex flex-col divide-y divide-zinc-800 border-y border-zinc-800">
              {shown.map(game => (
                <GameRow
                  key={game.id}
                  userId={userId}
                  game={game}
                  line={linesByGame.get(game.id) ?? []}
                  href={`/games/${game.id}?opening=${openingId}`}
                />
              ))}
            </div>
          </>
        )}
      </Panel>

      {/*
        Line studies sit above References because they are not the same kind of link.
        This is the study of the moves — the place you open mid-game to see a variation
        worked out — where a reference is something you read once.
      */}
      <Panel
        id={panelId('lines')}
        title={section('lines').title}
        meta={linkMeta(linksIn(study, 'lines').length, 'study', 'studies')}
      >
        <StudyLinks
          links={study.links}
          section="lines"
          editing={editing}
          hint={section('lines').hint}
          placeholder="https://lichess.org/study/…"
          embed
          onChange={links => edit(current => ({ ...current, links }))}
        />
      </Panel>

      <Panel
        id={panelId('references')}
        title={section('references').title}
        meta={linkMeta(linksIn(study, 'references').length, 'link', 'links')}
      >
        <StudyLinks
          links={study.links}
          section="references"
          editing={editing}
          hint={section('references').hint}
          onChange={links => edit(current => ({ ...current, links }))}
        />
      </Panel>

      <p className="text-xs text-zinc-600">
        The line itself — its name, its moves and which colour it counts for — is edited on{' '}
        <Link href="/openings" className="text-zinc-400 hover:text-zinc-200 underline">
          the openings page
        </Link>
        .{' '}
        {opening.color !== 'any' && openingLabel(opening) !== opening.name && (
          <span>This one is saved {COLOR_BADGE[opening.color].toLowerCase()}.</span>
        )}
      </p>
    </div>
  )
}

export default function OpeningStudyPage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Opening" wide>
      {user => <StudyBody key={params.id} userId={user.uid} openingId={params.id} />}
    </PageShell>
  )
}
