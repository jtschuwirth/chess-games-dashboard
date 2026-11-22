'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { getModelGames, saveModelGame } from '@/lib/firestore'
import { commentedPlies } from '@/lib/pattern'
import {
  emptyModelGame,
  lineFromPgn,
  modelGameHeaders,
  modelGameLabel,
  modelGameMeta,
  sortModelGames,
} from '@/lib/model-game'
import type { ModelGame } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

function ModelsBody({ userId }: { userId: string }) {
  const [games, setGames] = useState<ModelGame[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [pgn, setPgn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      getModelGames(userId)
        .then(loaded => {
          setGames(loaded)
          setLoadError(null)
        })
        .catch(caught => setLoadError(errorText(caught, 'Could not load your model games.'))),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  /**
   * A pasted game becomes a document, named by its own headers.
   *
   * The players, the event, the year and the result are read off the PGN rather than
   * typed in again — a game copied from a database carries all four, and asking for them
   * is asking for what the paste already said. Anything the headers did not carry is left
   * empty for the game's own page to fill in.
   */
  async function create() {
    if (pgn.trim().length === 0) return

    setBusy(true)
    setError(null)
    try {
      const blank = emptyModelGame(Date.now())
      const game = {
        ...blank,
        ...modelGameHeaders(pgn),
        // throws on a PGN that will not read, which is caught below with the text kept
        line: lineFromPgn(blank.line, pgn),
      }

      await saveModelGame(userId, game)
      setPgn('')
      setAdding(false)
      await load()
    } catch (caught) {
      setError(errorText(caught, 'Could not read that game.'))
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={load} />
  if (!games) return <Spinner />

  const shown = sortModelGames(games)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-zinc-500 max-w-xl">
          Games somebody else played, kept to study. Comment them move by move, say what
          each one was about, and cite them from a study pointed at the move the idea
          appears on. They are reference material, so they stay out of your own results.
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors shrink-0"
          >
            Add a game
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3">
          <label className="text-xs uppercase tracking-wide text-zinc-500">
            PGN{' '}
            <span className="normal-case tracking-normal text-zinc-600">
              — headers and all, as you copied it
            </span>
          </label>
          <textarea
            value={pgn}
            onChange={event => setPgn(event.target.value)}
            rows={6}
            placeholder={'[White "Karpov, Anatoly"]\n[Black "Spassky, Boris"]\n\n1. e4 c6 2. d4 d5 …'}
            className={`${INPUT} font-mono text-xs resize-y`}
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={create}
              disabled={busy || pgn.trim().length === 0}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Bring it in'}
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

      {games.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          Nothing here yet — paste in the game your book spends four pages on.
        </p>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
          {shown.map(game => {
            const comments = commentedPlies(game.line).size
            const moves = game.line.moves.length

            return (
              <Link
                key={game.id}
                href={`/models/${game.id}`}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
              >
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-zinc-100">
                    {modelGameLabel(game)}
                  </span>
                  <span className="text-xs text-zinc-500 truncate">
                    {[modelGameMeta(game), game.description].filter(Boolean).join(' — ')}
                  </span>
                </div>

                <span className="shrink-0 text-xs text-zinc-600 text-right">
                  {moves > 0 ? `${Math.ceil(moves / 2)} moves` : 'no moves'}
                  {comments > 0 ? ` · ${comments} commented` : ''}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ModelsPage() {
  return (
    <PageShell title="Model games" tab="Models" wide>
      {user => <ModelsBody userId={user.uid} />}
    </PageShell>
  )
}
