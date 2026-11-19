'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Chip from '@/components/Chip'
import ColorDot from '@/components/ColorDot'
import MethodCard from '@/components/MethodCard'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import { dailyProgress } from '@/lib/daily'
import { getDailyGames, saveDailyGame } from '@/lib/firestore'
import type { Color, DailyGame } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

function DailyBody({ userId }: { userId: string }) {
  const [games, setGames] = useState<DailyGame[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [opponent, setOpponent] = useState('')
  const [color, setColor] = useState<Color>('white')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      getDailyGames(userId)
        .then(loaded => {
          setGames(loaded)
          setLoadError(null)
        })
        .catch(caught => setLoadError(errorText(caught, 'Could not load your daily games.'))),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  async function create() {
    if (opponent.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      await saveDailyGame(userId, {
        opponent: opponent.trim(),
        color,
        ...(url.trim().length > 0 ? { url: url.trim() } : {}),
        pgn: '',
        moves: [],
        logs: {},
        finished: false,
        note: '',
        // stamped on the press rather than in a render, which the purity rule forbids
        createdAt: Date.now(),
      })
      setOpponent('')
      setUrl('')
      setAdding(false)
      await load()
    } catch (caught) {
      setError(errorText(caught, 'Could not start that game.'))
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <LoadError message={loadError} onRetry={load} />
  if (!games) return <Spinner />

  const playing = games.filter(game => !game.finished)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-zinc-500 max-w-xl">
          A game played at three days a move, so there is time to run the whole loop and
          write down what each step found. The record is the point: when the engine
          disagrees afterwards, the answer says which step missed it.
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors shrink-0"
          >
            New game
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wide text-zinc-500">Opponent</label>
            <input
              value={opponent}
              onChange={event => setOpponent(event.target.value)}
              placeholder="their username"
              className={INPUT}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wide text-zinc-500">
              I am playing
            </label>
            <div className="flex items-center gap-2">
              <Chip active={color === 'white'} onClick={() => setColor('white')}>
                White
              </Chip>
              <Chip active={color === 'black'} onClick={() => setColor('black')}>
                Black
              </Chip>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wide text-zinc-500">
              Where it is being played
            </label>
            <input
              value={url}
              onChange={event => setUrl(event.target.value)}
              placeholder="https://… — so the game is one press away"
              className={INPUT}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={create}
              disabled={busy || opponent.trim().length === 0}
              className="px-4 py-2 text-xs rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Saving…' : 'Start'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      )}

      {games.length === 0 && !adding ? (
        <p className="text-sm text-zinc-600">
          No games yet. Start one when you have a daily game to play, and write the loop
          down as each move comes round.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {games.map(game => {
            const progress = dailyProgress(game)

            return (
              <Link
                key={game.id}
                href={`/daily/${game.id}`}
                className="flex flex-col gap-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <ColorDot color={game.color} />
                  <span className="text-sm font-medium text-zinc-100">
                    {game.opponent || 'unnamed'}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {progress.moves === 0
                      ? 'no moves yet'
                      : `${progress.logged} of ${progress.moves} of your moves written up`}
                  </span>
                  {game.finished && (
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500 border border-zinc-700 rounded-full px-2 py-0.5">
                      finished
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-600 font-mono truncate">
                  {game.moves.length > 0
                    ? game.moves.slice(0, 12).join(' ')
                    : 'nothing played yet'}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {/*
        The method sits on the section that uses it, open while there is nothing else
        here to read: a procedure you are trying to internalise is worth meeting every
        time you come to play, and it folds away once it is in your head.
      */}
      <Panel id="daily-method" title="The move loop" startFolded={playing.length > 0}>
        <MethodCard />
      </Panel>
    </div>
  )
}

export default function DailyPage() {
  return (
    <PageShell title="Daily games" tab="Daily" wide>
      {user => <DailyBody userId={user.uid} />}
    </PageShell>
  )
}
