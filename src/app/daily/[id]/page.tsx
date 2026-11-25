'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BackLink from '@/components/BackLink'
import Chip from '@/components/Chip'
import ColorDot from '@/components/ColorDot'
import MethodCard from '@/components/MethodCard'
import MoveLogForm from '@/components/MoveLogForm'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import {
  dailyBody,
  dailyFromTree,
  dailyProgress,
  dailyTree,
  emptyLog,
  formatEvalGuess,
  inBookAt,
  isYourMove,
  logHasContent,
  logProgress,
  uploadFrom,
  withBookEnd,
  yourPlies,
} from '@/lib/daily'
import DailyReviewPanel from '@/components/DailyReviewPanel'
import { clearDraft, readDraft, writeDraft } from '@/lib/draft'
import {
  deleteDailyGame,
  gameDocId,
  getDailyGames,
  getGames,
  saveGames,
  updateDailyGame,
} from '@/lib/firestore'
import {
  mainPath,
  moveLabel,
  moveNumberAt,
  pathOfLine,
  sansAlong,
  START_FEN,
} from '@/lib/movetree'
import type { DailyGame, GameRecord, GameResult, MoveLog } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

const RESULTS: GameResult[] = ['win', 'draw', 'loss']

function DailyGameBody({ userId, gameId }: { userId: string; gameId: string }) {
  const router = useRouter()
  const [game, setGame] = useState<DailyGame | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [restored, setRestored] = useState<number | null>(null)
  /** The game as the server last had it, for what "unsaved" means. */
  const [savedGame, setSavedGame] = useState<DailyGame | null>(null)
  /** The stored games, for the one this became once it was brought in. */
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [bringing, setBringing] = useState(false)
  /**
   * Where the board is standing, held as the moves leading there rather than as node
   * ids: every edit writes the line back out as a PGN and `fromPgn` mints fresh ids on
   * the way back in, so a path of ids is stale the instant you play a move. Null means
   * the end of the game, which is where a daily game is nearly always being read from.
   */
  const [cursor, setCursor] = useState<string[] | null>(null)

  const load = useCallback(
    () =>
      Promise.all([getDailyGames(userId), getGames(userId)])
        .then(([loaded, stored]) => {
          setGames(stored)
          const found = loaded.find(entry => entry.id === gameId) ?? null
          setMissing(found === null)
          if (!found) return

          const draft = readDraft<DailyGame>(
            'daily',
            userId,
            gameId,
            body => Boolean(body) && typeof (body as DailyGame).pgn === 'string',
          )

          setSavedGame(found)

          if (draft && (!found.updatedAt || draft.editedAt >= found.updatedAt)) {
            setGame({ ...draft.body, id: gameId })
            setRestored(draft.editedAt)
          } else {
            if (draft) clearDraft('daily', userId, gameId)
            setGame(found)
            setRestored(null)
          }
          setLoadError(null)
        })
        .catch(caught => setLoadError(errorText(caught, 'Could not load that game.'))),
    [userId, gameId],
  )

  useEffect(() => {
    load()
  }, [load])

  /* Every edit is a function of the current value: several handlers in one React batch
     all read the same render, so anything else loses all but the last. */
  const edit = useCallback(
    (update: (current: DailyGame) => DailyGame) => {
      setGame(current => {
        if (!current) return current
        const next = update(current)
        writeDraft('daily', userId, gameId, next)
        return next
      })
      setSaved(false)
    },
    [userId, gameId],
  )

  const tree = useMemo(() => (game ? dailyTree(game) : null), [game])

  const path = useMemo(() => {
    if (!tree || !game) return []
    if (cursor === null) return mainPath(tree, game.moves.length)
    if (cursor.length === 0) return []
    return pathOfLine(tree, cursor) ?? mainPath(tree, game.moves.length)
  }, [tree, game, cursor])

  const dirty = useMemo(
    () =>
      game !== null &&
      JSON.stringify(dailyBody(game)) !==
        JSON.stringify(savedGame ? dailyBody(savedGame) : null),
    [game, savedGame],
  )

  const progress = useMemo(() => (game ? dailyProgress(game) : null), [game])

  /*
   * The game document this became. Looked up by the id it would have been given as well
   * as by the link stored on the daily game, so a game brought in and then edited before
   * the link was written is still found rather than brought in twice.
   */
  const record = useMemo(() => {
    if (!game || !games) return null
    const id = game.gameId ?? gameDocId('upload', `daily${game.id}`)
    return games.find(entry => entry.id === id) ?? null
  }, [game, games])

  /**
   * Bring the finished game in as an ordinary game document.
   *
   * The link is written straight to the server around the baseline, the way a plan day
   * saves: this is one field, and it must not be the thing that commits whatever else
   * you had half-written on the page.
   */
  async function bringIn() {
    if (!game || !savedGame || bringing) return
    setBringing(true)
    setError(null)
    try {
      await saveGames(userId, [uploadFrom(game)])
      // fresh, because the write has to be visible to the lookup that draws the panel
      setGames(await getGames(userId, { fresh: true }))

      const id = gameDocId('upload', `daily${game.id}`)
      await updateDailyGame(userId, gameId, dailyBody({ ...savedGame, gameId: id }))
      setSavedGame(current => (current ? { ...current, gameId: id } : current))
      edit(current => ({ ...current, gameId: id }))
    } catch (caught) {
      setError(errorText(caught, 'Could not bring that game in.'))
    } finally {
      setBringing(false)
    }
  }

  async function save() {
    if (!game) return
    setSaving(true)
    setError(null)
    try {
      // logs opened and never written are dropped, the same as an empty exercise
      const logs = Object.fromEntries(
        Object.entries(game.logs).filter(([, log]) => logHasContent(log)),
      )
      const kept = { ...game, logs }
      await updateDailyGame(userId, gameId, dailyBody(kept))
      clearDraft('daily', userId, gameId)
      setGame(kept)
      setSavedGame(kept)
      setRestored(null)
      setSaved(true)
    } catch (caught) {
      setError(errorText(caught, 'Could not save that game.'))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setSaving(true)
    try {
      await deleteDailyGame(userId, gameId)
      clearDraft('daily', userId, gameId)
      router.push('/daily')
    } catch (caught) {
      setError(errorText(caught, 'Could not delete that game.'))
      setSaving(false)
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={load} />
  if (missing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-400">That game is not here any more.</p>
        <BackLink fallback={{ href: '/daily', label: 'Daily games' }} />
      </div>
    )
  }
  if (!game || !tree || !progress) return <Spinner />

  /** The move about to be played from where the board is standing. */
  const ply = path.length
  const yours = isYourMove(game.color, ply)
  const log: MoveLog = game.logs[String(ply)] ?? emptyLog(ply)
  const inBook = inBookAt(game, ply)
  const answered = logProgress(log, inBook)

  /** One move's log, rewritten against whatever it currently holds. */
  function editLogAt(at: number, update: (current: MoveLog) => MoveLog) {
    edit(current => {
      const key = String(at)
      const existing = current.logs[key] ?? emptyLog(at)
      return { ...current, logs: { ...current.logs, [key]: update(existing) } }
    })
  }

  function editLog(update: (current: MoveLog) => MoveLog) {
    editLogAt(ply, update)
  }

  const written = yourPlies(game, game.moves.length - 1).filter(at =>
    logHasContent(game.logs[String(at)] ?? emptyLog(at)),
  )

  return (
    <div className="flex flex-col gap-5">
      <BackLink fallback={{ href: '/daily', label: 'Daily games' }} />

      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ColorDot color={game.color} />
            <input
              value={game.opponent}
              onChange={event =>
                edit(current => ({ ...current, opponent: event.target.value }))
              }
              aria-label="Opponent"
              className="text-xl font-semibold text-zinc-100 bg-transparent outline-none border-b border-transparent focus:border-zinc-700 min-w-0 flex-1"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-zinc-500">
              {progress.logged} of {progress.moves} written up
            </span>
            <button
              onClick={remove}
              disabled={saving}
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

        <div className="flex items-center gap-2 flex-wrap">
          {game.url && (
            <a
              href={game.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-400 underline hover:text-zinc-100 transition-colors"
            >
              open the game
            </a>
          )}
          <span className="text-xs text-zinc-600">·</span>
          <Chip
            active={game.finished}
            onClick={() =>
              edit(current => {
                const next = { ...current, finished: !current.finished }
                if (next.finished === false) delete next.result
                return next
              })
            }
          >
            finished
          </Chip>
          {game.finished &&
            RESULTS.map(result => (
              <Chip
                key={result}
                active={game.result === result}
                onClick={() => edit(current => ({ ...current, result }))}
              >
                {result}
              </Chip>
            ))}
        </div>
      </div>

      {restored !== null && (
        <p className="text-xs text-amber-400/90">
          Restored what you had not saved on this device, from{' '}
          {new Date(restored).toLocaleString()}.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[26rem_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-3 lg:sticky lg:top-4">
          {/*
            The board is where the moves are entered: their move goes on first, and then
            you are standing in the position the loop is about to be run from.
          */}
          <MoveTreeBoard
            tree={tree}
            path={path}
            orientation={game.color}
            onPath={at => setCursor(sansAlong(tree, at))}
            onTree={(next, at) => {
              edit(current => dailyFromTree(current, next))
              setCursor(sansAlong(next, at))
            }}
          />

          <p className="text-xs text-zinc-500">
            {yours
              ? `Your move — ${moveNumberAt(START_FEN, ply)}`
              : 'Their move. Play it on the board, then the loop is about your reply.'}
          </p>

          {written.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {written.map(at => {
                const entry = game.logs[String(at)]
                return (
                  <button
                    key={at}
                    type="button"
                    onClick={() => setCursor(sansAlong(tree, mainPath(tree, at)))}
                    title={
                      entry?.evaluation !== null && entry?.evaluation !== undefined
                        ? `you called it ${formatEvalGuess(entry.evaluation)}`
                        : 'no eval written'
                    }
                    className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                      at === ply
                        ? 'border-zinc-400 text-zinc-100'
                        : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >
                    {moveLabel(START_FEN, at, game.moves[at] ?? '…', true)}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {yours ? (
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-zinc-100">
                  {moveLabel(START_FEN, ply, game.moves[ply] ?? '?', true)}
                </h2>
                <span className="text-xs text-zinc-500">
                  {answered.answered} of {answered.asked} steps answered
                </span>
                {game.moves[ply] === undefined && (
                  <span className="text-xs text-zinc-600">not played yet</span>
                )}
              </div>

              <MoveLogForm
                log={log}
                color={game.color}
                inBook={inBook}
                onBook={out => edit(current => withBookEnd(current, ply, out))}
                onChange={editLog}
              />
            </section>
          ) : (
            <p className="text-sm text-zinc-600">
              Standing on your opponent&rsquo;s move. Play it on the board and the form
              comes back for your reply.
            </p>
          )}

          {/*
            The post-mortem sits under the form rather than on a page of its own: the
            thing you are filing a move under is the thing you wrote about it, and the
            two being a scroll apart is what would make filing a matter of memory.
          */}
          <Panel
            id="daily-postmortem"
            title="Post-mortem"
            meta={game.finished ? undefined : 'once the game is over'}
            startFolded={!game.finished}
          >
            <DailyReviewPanel
              game={game}
              record={record}
              onFile={editLogAt}
              onBringIn={bringIn}
              bringing={bringing}
              error={error}
            />
          </Panel>

          <Panel id="daily-game-method" title="The move loop" startFolded>
            <MethodCard />
          </Panel>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wide text-zinc-500">
              What the game taught me
            </label>
            <textarea
              value={game.note}
              onChange={event => edit(current => ({ ...current, note: event.target.value }))}
              rows={3}
              placeholder="Written at the end, once the engine has had its say."
              className={`${INPUT} resize-y`}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap border-t border-zinc-800 pt-4">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-4 py-2 text-xs rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
        {dirty && !saving && <span className="text-xs text-zinc-600">unsaved changes</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  )
}

export default function DailyGamePage() {
  const params = useParams<{ id: string }>()

  return (
    <PageShell title="Daily game" tab="Daily" wide>
      {user => <DailyGameBody key={params.id} userId={user.uid} gameId={params.id} />}
    </PageShell>
  )
}
