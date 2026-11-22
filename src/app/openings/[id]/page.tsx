'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import BackLink from '@/components/BackLink'
import ColorDot from '@/components/ColorDot'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import { getOpenings, getStudies, saveStudyRecord } from '@/lib/firestore'
import { withFrom } from '@/lib/nav'
import { buildOpeningTree, findPath, formatMoves, openingLines } from '@/lib/opening'
import { emptyStudy, ideaCount, studyBody, studyHasContent } from '@/lib/study'
import {
  STUDY_KIND_BADGE,
  STUDY_KIND_LABEL,
  newStudy,
} from '@/lib/studies'
import { COLOR_LABEL, type OpeningLine, type StudyRecord } from '@/types/chess'

/**
 * One saved line: its moves, its other ways in, and the lines saved under it.
 *
 * It used to be the opening's write-up as well — the overview, the plans, the patterns,
 * the lichess studies and the references — and that is the Studies section's job now. The
 * reason is that a write-up is not about a move order: the Panov and the Queen's Gambit
 * both reach an isolated queen's pawn, and with the prose attached to a line there was
 * nowhere for the shared half to live but inside one of them, typed out again in the
 * other. So a study names the lines it covers, from the other end, and this page is what
 * it names.
 *
 * What is left is the line itself, which is what the repertoire is: where it sits, what
 * it plays, how else it is reached, and what is saved below it. Everything your games did
 * there is read in the study that covers it, or in the dashboard.
 */
function OpeningBody({ userId, openingId }: { userId: string; openingId: string }) {
  const [openings, setOpenings] = useState<OpeningLine[] | null>(null)
  const [studies, setStudies] = useState<StudyRecord[]>([])
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true

    /*
      Fresh, the one read in the app besides plans and studies that is: a line you save
      on a laptop and open on a phone must not come from the phone's cache. The
      dashboard's hot path keeps the cache-first default.
    */
    Promise.all([getOpenings(userId, { fresh: true }), getStudies(userId)])
      .then(([loadedOpenings, loadedStudies]) => {
        if (!live) return
        setOpenings(loadedOpenings)
        setStudies(loadedStudies)
        setMissing(!loadedOpenings.some(entry => entry.id === openingId))
        setLoadError(null)
      })
      .catch(caught => {
        if (!live) return
        setLoadError(errorText(caught, 'Could not load this opening.'))
      })

    return () => {
      live = false
    }
  }, [userId, openingId, reload])

  const opening = openings?.find(entry => entry.id === openingId) ?? null
  const tree = useMemo(() => buildOpeningTree(openings ?? []), [openings])
  const path = useMemo(() => findPath(tree, openingId), [tree, openingId])
  const node = path[path.length - 1] ?? null

  /** The studies that name this line — the other end of a study's `openingIds`. */
  const studiesHere = useMemo(
    () => studies.filter(study => study.openingIds.includes(openingId)),
    [studies, openingId],
  )

  /**
   * Each way into this opening.
   *
   * The second, third and fourth Panov line goes here rather than into the tree — they
   * are the same opening, so a node each would be the self-nesting this replaced.
   */
  const waysIn = useMemo(() => (opening?.alts?.length ? openingLines(opening) : []), [opening])

  /**
   * Start a study from this line, carrying over anything already written on it.
   *
   * The prose written here before studies existed is not thrown away and is not editable
   * here either: this is the one press that moves it. The opening's own `study` field is
   * left exactly as it is — inert, like `ignored` before it — because deleting it would
   * make the move irreversible for the sake of tidiness.
   */
  async function startStudy() {
    if (!opening) return

    setBusy(true)
    setError(null)
    const body = newStudy({
      name: opening.name,
      kind: 'opening',
      color: opening.color,
      description: '',
      openingId,
      // stamped on the press rather than in a render, which the purity rule forbids
      createdAt: Date.now(),
    })
    const carried = opening.study ? studyBody(opening.study) : emptyStudy()

    try {
      const id = await saveStudyRecord(userId, { ...body, body: carried })
      window.location.href = `/studies/${id}`
    } catch (caught) {
      setError(errorText(caught, 'Could not start that study.'))
      setBusy(false)
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={() => setReload(n => n + 1)} />

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

  if (!opening) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  const here = `/openings/${openingId}`
  const written = ideaCount(opening.study)
  const carriedOver = opening.study !== undefined && studyHasContent(opening.study)

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback={{ href: '/openings', label: 'All openings' }} />

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
            <ColorDot color={opening.color} size="w-2.5 h-2.5" />
            <h2 className="text-xl font-semibold text-zinc-100">{opening.name}</h2>
            <span className="text-xs text-zinc-600">{COLOR_LABEL[opening.color]}</span>
          </div>

          <p className="text-xs text-zinc-500 font-mono mt-1 break-words">
            {formatMoves(opening.moves)}
          </p>
        </div>

        <Link
          href={`/dashboard?opening=${openingId}`}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
        >
          Your games here →
        </Link>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {waysIn.length > 1 && (
        <Panel
          id="opening-ways"
          title="Ways in"
          meta={`${waysIn.length} move orders`}
        >
          {/* the main line decides the tree; every other way in is a row here rather
              than a second node, which is the self-nesting `alts` replaced */}
          <div className="flex flex-col gap-1">
            {waysIn.map((line, index) => (
              <div key={index} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono text-zinc-400 break-words min-w-0">
                  {formatMoves(line.moves)}
                </span>
                {index === 0 && <span className="shrink-0 text-zinc-600">main</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-600">
            Edited with the line itself, on{' '}
            <Link href="/openings" className="text-zinc-400 hover:text-zinc-200 underline">
              the openings page
            </Link>
            .
          </p>
        </Panel>
      )}

      <Panel
        id="opening-studies"
        title="Studies"
        meta={studiesHere.length > 0 ? `${studiesHere.length} here` : undefined}
        actions={
          <button
            onClick={startStudy}
            disabled={busy}
            className="px-2.5 py-1 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
          >
            {busy ? 'Starting…' : 'New study'}
          </button>
        }
      >
        {studiesHere.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Nothing written up yet. A study is where the plans, the patterns and the model
            games go — and it can point at the structure this line reaches, so that half is
            written once rather than in every opening that gets there.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
            {studiesHere.map(study => (
              <Link
                key={study.id}
                href={withFrom(`/studies/${study.id}`, here)}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
              >
                <ColorDot color={study.color} />
                <span className="min-w-0 flex-1 text-sm text-zinc-200 truncate">
                  {study.name}
                </span>
                <span
                  className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                    STUDY_KIND_BADGE[study.kind]
                  }`}
                >
                  {STUDY_KIND_LABEL[study.kind]}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/*
          The prose written on this line before studies existed. It is not editable here
          any more and it is not gone: New study carries it over, and the field is left on
          the document until it does.
        */}
        {carriedOver && studiesHere.length === 0 && (
          <p className="text-xs text-amber-400">
            {written > 0
              ? `${written} idea${written === 1 ? '' : 's'} were written on this line before studies existed.`
              : 'Something was written on this line before studies existed.'}{' '}
            New study brings it across.
          </p>
        )}
      </Panel>

      <Panel
        id="opening-variants"
        title="Lines saved under this one"
        meta={
          node && node.children.length > 0
            ? `${node.children.length} line${node.children.length === 1 ? '' : 's'}`
            : undefined
        }
      >
        {!node || node.children.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Save a longer line on the openings page and it files itself under this one.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
            {node.children.map(child => (
              <Link
                key={child.opening.id}
                href={`/openings/${child.opening.id}`}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
              >
                <ColorDot color={child.opening.color} />
                <div className="min-w-0 flex-1">
                  <span className="block text-sm text-zinc-200 truncate">
                    {child.opening.name}
                  </span>
                  <span className="block text-xs text-zinc-600 font-mono truncate">
                    {formatMoves(child.opening.moves)}
                  </span>
                </div>
                {child.children.length > 0 && (
                  <span className="shrink-0 text-xs text-zinc-600">
                    {child.children.length} under it
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <p className="text-xs text-zinc-600">
        The line itself — its name, its moves, its other ways in and which colour it counts
        for — is edited on{' '}
        <Link href="/openings" className="text-zinc-400 hover:text-zinc-200 underline">
          the openings page
        </Link>
        .
      </p>
    </div>
  )
}

export default function OpeningPage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Opening" wide>
      {user => <OpeningBody key={params.id} userId={user.uid} openingId={params.id} />}
    </PageShell>
  )
}
