'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import BackLink from '@/components/BackLink'
import Chip from '@/components/Chip'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { formatMoment } from '@/lib/days'
import { clearDraft, draftSuperseded, readDraft, writeDraft } from '@/lib/draft'
import { deleteModelGame, getModelGames, updateModelGame } from '@/lib/firestore'
import { commentAt as setComment, moveLabel } from '@/lib/movetree'
import { commentedNodes, lineOrientation } from '@/lib/pattern'
import { useLineEditor } from '@/lib/use-line-editor'
import {
  PGN_RESULTS,
  RESULT_LABEL,
  lineFromPgn,
  modelGameBody,
  modelGameChanged,
  modelGameHeaders,
  modelGameLabel,
  plyLabel,
} from '@/lib/model-game'
import type { NewModelGame, PatternLine } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/** A shape that is not a model game is not worth restoring, and must not throw later. */
function isModelGame(body: unknown): boolean {
  const game = body as NewModelGame
  return Boolean(game) && typeof game.white === 'string' && Array.isArray(game.line?.moves)
}

function GameBody({ userId, gameId, openPly }: { userId: string; gameId: string; openPly?: number }) {
  /** What is on screen, edited or not. */
  const [game, setGame] = useState<NewModelGame | null>(null)
  /** The game as Firestore last confirmed it, which is what "unsaved" is measured against. */
  const [stored, setStored] = useState<NewModelGame | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [restored, setRestored] = useState<number | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true

    getModelGames(userId)
      .then(loaded => {
        if (!live) return

        const found = loaded.find(entry => entry.id === gameId) ?? null
        if (!found) {
          setMissing(true)
          return
        }

        const body = modelGameBody(found)

        /*
          A draft on this device usually outranks what Firestore has, because it exists
          only where edits were made and not saved. It is restored rather than offered,
          unless another device has saved since — in which case it is work already moved
          past, and putting it back would undo what that device did.
        */
        const draft = readDraft<NewModelGame>('model', userId, gameId, isModelGame)
        const superseded = draft !== null && draftSuperseded(draft.editedAt, found.updatedAt)

        if (draft && !superseded && modelGameChanged(draft.body, body)) {
          setGame(draft.body)
          setRestored(draft.editedAt)
        } else {
          if (draft) clearDraft('model', userId, gameId)
          setGame(body)
          setRestored(null)
        }

        setStored(body)
        setLoadError(null)
      })
      .catch(caught => {
        if (!live) return
        setLoadError(errorText(caught, 'Could not load that game.'))
      })

    return () => {
      live = false
    }
  }, [userId, gameId, reload])

  const unsaved = game !== null && stored !== null && modelGameChanged(game, stored)

  useEffect(() => {
    if (game && unsaved) writeDraft('model', userId, gameId, modelGameBody(game))
  }, [game, unsaved, userId, gameId])

  /** The browser's own warning, for the one exit the draft cannot cover. */
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  if (loadError) return <LoadError message={loadError} onRetry={() => setReload(n => n + 1)} />

  if (missing) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <p className="text-sm text-zinc-500">That game is not there any more.</p>
        <Link href="/models" className="text-sm text-zinc-300 underline">
          Back to model games
        </Link>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  async function commit() {
    if (!game) return
    setSaving(true)
    setError(null)
    try {
      await updateModelGame(userId, gameId, game)
      setStored(modelGameBody(game))
      clearDraft('model', userId, gameId)
      setRestored(null)
    } catch (caught) {
      setError(errorText(caught, 'Could not save — your changes are still here.'))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    try {
      await deleteModelGame(userId, gameId)
      clearDraft('model', userId, gameId)
      window.location.href = '/models'
    } catch (caught) {
      setError(errorText(caught, 'Could not delete that game.'))
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback={{ href: '/models', label: 'Model games' }} />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          <h2 className="text-xl font-semibold text-zinc-100">
            {modelGameLabel(game)}
          </h2>
          {unsaved && (
            <span
              title="This game has changes that are not saved"
              className="w-1.5 h-1.5 rounded-full bg-amber-400/80"
            />
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => (confirming ? remove() : setConfirming(true))}
            className={`text-xs transition-colors ${
              confirming ? 'text-red-400' : 'text-zinc-600 hover:text-red-400'
            }`}
          >
            {confirming ? 'Really delete?' : 'Delete'}
          </button>
          <button
            onClick={commit}
            disabled={!unsaved || saving}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:hover:bg-zinc-100"
          >
            {saving ? 'Saving…' : unsaved ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {restored !== null && (
        <p className="text-xs text-amber-400">
          Unsaved changes from {formatMoment(restored)} were picked up from this device. Save
          them, or reload the page to go back to the stored game.
        </p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <GameEditor game={game} onChange={setGame} openPly={openPly} />
    </div>
  )
}

/**
 * The game and everything written on it, in one row: the board on the left and what is
 * being said about it on the right.
 *
 * Its own component so the line editor's cursor is mounted with a line in hand — the
 * ply a study cites is read once, in a lazy initialiser, and a hook cannot be given one
 * before the document has arrived.
 */
function GameEditor({
  game,
  onChange,
  openPly,
}: {
  game: NewModelGame
  onChange: (next: NewModelGame) => void
  openPly?: number
}) {
  const [pgnError, setPgnError] = useState<string | null>(null)

  const setLine = (line: PatternLine) => onChange({ ...game, line })
  const editor = useLineEditor(game.line, setLine, openPly)
  const { tree, home, path, standing, stepTo, resetCursor } = editor

  function setTree(...args: Parameters<typeof editor.setTree>) {
    setPgnError(null)
    editor.setTree(...args)
  }

  /**
   * The game as text. Pasting a fresh PGN over it re-reads the headers as well, since a
   * new game in the box is a new game — but only into the fields nothing has been typed
   * into, because a correction you made by hand must not be undone by the paste it was
   * correcting.
   */
  function setPgn(pgn: string) {
    try {
      const line = lineFromPgn(game.line, pgn)
      const headers = modelGameHeaders(pgn)
      setPgnError(null)
      resetCursor()
      onChange({
        ...game,
        line,
        white: game.white.trim() || headers.white,
        black: game.black.trim() || headers.black,
        event: game.event.trim() || headers.event,
        year: game.year ?? headers.year,
        result: game.result === '*' ? headers.result : game.result,
      })
    } catch (caught) {
      // the text is kept whatever happens: a typo mid-line must not throw away the rest
      setPgnError(caught instanceof Error ? caught.message : 'Could not read those moves.')
      setLine({ ...game.line, pgn })
    }
  }

  const notes = commentedNodes(tree)
  const at = path.length

  return (
    <div className="grid lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] gap-5 items-start">
      <div className="w-full max-w-[28rem] mx-auto lg:mx-0 flex flex-col gap-2">
        <MoveTreeBoard
          tree={tree}
          path={path}
          onPath={stepTo}
          onTree={setTree}
          orientation={lineOrientation(game.line)}
          onFlip={() =>
            setLine({
              ...game.line,
              orientation: lineOrientation(game.line) === 'white' ? 'black' : 'white',
            })
          }
          home={home}
        />

        {/*
          Where the board opens, set from where you are standing rather than typed as a
          number: the move you are looking at is the move you mean, and a ply count is
          something nobody holds in their head. A study citing this game can still point
          it somewhere else — this is the game's own answer, not the citation's.
        */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500">
          <span>
            Opens on{' '}
            <span className="text-zinc-300">
              {plyLabel(game, game.line.startPly)}
            </span>
          </span>
          {at !== game.line.startPly && (
            <button
              type="button"
              onClick={() => setLine({ ...game.line, startPly: at })}
              className="text-zinc-400 hover:text-zinc-100 underline transition-colors"
            >
              open here instead
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label="White">
            <input
              value={game.white}
              onChange={event => onChange({ ...game, white: event.target.value })}
              placeholder="Karpov, Anatoly"
              className={INPUT}
            />
          </Field>
          <Field label="Black">
            <input
              value={game.black}
              onChange={event => onChange({ ...game, black: event.target.value })}
              placeholder="Spassky, Boris"
              className={INPUT}
            />
          </Field>
          <Field label="Event">
            <input
              value={game.event}
              onChange={event => onChange({ ...game, event: event.target.value })}
              placeholder="Linares"
              className={INPUT}
            />
          </Field>
          <Field label="Year">
            <input
              value={game.year ?? ''}
              onChange={event => {
                const year = Number(event.target.value)
                const next = { ...game }
                // set or left out, never assigned undefined: an undefined value rejects
                // the whole document rather than the field
                if (Number.isFinite(year) && year > 1400) next.year = year
                else delete next.year
                onChange(next)
              }}
              inputMode="numeric"
              placeholder="1993"
              className={INPUT}
            />
          </Field>
        </div>

        <Field label="Result">
          <div className="flex gap-1.5 flex-wrap">
            {PGN_RESULTS.map(result => (
              <Chip
                key={result}
                active={game.result === result}
                onClick={() => onChange({ ...game, result })}
                title={RESULT_LABEL[result]}
              >
                {result === '*' ? 'unfinished' : result}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="What it was about">
          <textarea
            value={game.description}
            onChange={event => onChange({ ...game, description: event.target.value })}
            rows={3}
            placeholder="White takes on d5 and plays against the isolani; the knight on e5 is the whole plan"
            className={`${INPUT} resize-y`}
          />
        </Field>

        {/*
          The comment is for whichever move is on the board, so commenting a game is
          step, say what the move is for, step again. It lives on the move, which is
          where PGN puts it and the only place that still means something once the line
          can branch.
        */}
        <Field
          label={
            <>
              On{' '}
              <span className="normal-case tracking-normal font-mono text-zinc-400">
                {standing
                  ? moveLabel(tree.startFen, path.length - 1, standing.san, true)
                  : 'this move'}
              </span>
            </>
          }
        >
          <textarea
            value={standing?.comment ?? ''}
            onChange={event => setTree(setComment(tree, path, event.target.value), path)}
            disabled={!standing}
            rows={3}
            placeholder={standing ? 'what this move does' : 'step to a move to write on it'}
            className={`${INPUT} resize-y disabled:opacity-40`}
          />
        </Field>

        <Field label="Moves">
          <textarea
            value={game.line.pgn}
            onChange={event => setPgn(event.target.value)}
            rows={3}
            placeholder="1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4 {the Panov} Nf6"
            className={`${INPUT} font-mono text-xs resize-y`}
          />
          {pgnError && <span className="text-xs text-red-400">{pgnError}</span>}
        </Field>

        {notes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              The commentary
            </span>
            <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
              {notes.map(note => (
                <button
                  key={note.path.join('/')}
                  type="button"
                  onClick={() => stepTo(note.path)}
                  className={`text-left px-3 py-2 flex flex-col gap-0.5 transition-colors ${
                    path.join('/') === note.path.join('/')
                      ? 'bg-zinc-800/70'
                      : 'hover:bg-zinc-800/40'
                  }`}
                >
                  <span className="text-[11px] font-mono text-zinc-500">
                    {moveLabel(tree.startFen, note.path.length - 1, note.san, true)}
                  </span>
                  <span className="text-sm text-zinc-200 whitespace-pre-wrap">{note.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="text-xs uppercase tracking-wide text-zinc-500">{label}</label>
      {children}
    </div>
  )
}

function GameRoute() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()

  const ply = Number(search.get('ply'))
  return (
    <PageShell title="Model game" tab="Model" wide>
      {signedIn => (
        <GameBody
          userId={signedIn.uid}
          gameId={params.id}
          openPly={Number.isFinite(ply) && ply > 0 ? ply : undefined}
        />
      )}
    </PageShell>
  )
}

export default function ModelGamePage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 flex justify-center">
          <Spinner size="w-6 h-6" />
        </div>
      }
    >
      <GameRoute />
    </Suspense>
  )
}
