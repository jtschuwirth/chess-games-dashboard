'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import Panel from '@/components/Section'
import StatusTag from '@/components/StatusTag'
import UploadPanel from '@/components/UploadPanel'
import { formatTimeControl } from '@/lib/clocks'
import { getGames, getProfile } from '@/lib/firestore'
import { hasReview } from '@/lib/review'
import { endingOf } from '@/lib/termination'
import type { GameRecord, UserProfile } from '@/types/chess'

/**
 * The games you brought in, in one place.
 *
 * Pasting a PGN used to live on the profile page, among the linked accounts and the
 * analysis settings — a page about *who you are and how the app reads your games*, which
 * an uploaded game is neither. It is a kind of game, and the things you do to one are
 * read it, set the clock it was played at, and look at what is already here. That is a
 * section, not a box at the bottom of somebody else's.
 *
 * The list is the second half of the point: an upload is an id hashed from the moves, so
 * pasting the same game twice merges rather than duplicating — but until there was
 * somewhere to see them, there was no way to know what that had left you with.
 */
function UploadsBody({ userId }: { userId: string }) {
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const load = useCallback(
    () =>
      Promise.all([getGames(userId, { fresh: true }), getProfile(userId)])
        .then(([loadedGames, loadedProfile]) => {
          setGames(loadedGames)
          setProfile(loadedProfile)
          setError(null)
        })
        .catch(caught => setError(errorText(caught, 'Could not load your games.'))),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load, reload])

  /** Newest first, the order every other list of games here is in. */
  const uploaded = useMemo(
    () =>
      (games ?? [])
        .filter(game => game.source === 'upload')
        .sort((a, b) => b.playedAt - a.playedAt),
    [games],
  )

  /**
   * How many are still without a clock, which is the one thing you can only fix here.
   *
   * A pasted PGN usually carries no `TimeControl`, and a game with none falls out of
   * every clock reading *and* out of the Control row, which is built from the controls
   * the games actually carry. So the count is the work left rather than a statistic.
   */
  const untimed = uploaded.filter(game => !game.timeControl).length

  if (error && games === null) return <LoadError message={error} onRetry={load} />

  return (
    <div className="flex flex-col gap-5">
      {/* the panel needs the linked usernames to work out which side of a PGN is you */}
      {profile ? (
        <UploadPanel userId={userId} profile={profile} onUploaded={() => setReload(n => n + 1)} />
      ) : (
        <p className="text-sm text-zinc-600 flex items-center gap-2">
          <Spinner size="w-3.5 h-3.5" /> Reading your account…
        </p>
      )}

      <Panel
        id="uploaded-games"
        title="Games you have brought in"
        meta={
          games === null
            ? 'reading…'
            : uploaded.length === 0
              ? undefined
              : `${uploaded.length} game${uploaded.length === 1 ? '' : 's'}${
                  untimed > 0 ? ` · ${untimed} with no clock` : ''
                }`
        }
      >
        {games === null ? (
          <p className="text-sm text-zinc-600 flex items-center gap-2">
            <Spinner size="w-3.5 h-3.5" /> Reading your games…
          </p>
        ) : uploaded.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Nothing yet. A pasted game gets the board, the engine, the review and the
            drill like any other.
          </p>
        ) : (
          <div className="-mx-5 flex flex-col divide-y divide-zinc-800 border-y border-zinc-800">
            {uploaded.map(game => (
              <Link
                key={game.id}
                href={`/games/${game.id}?source=upload`}
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-800/50 transition-colors"
              >
                <span
                  className={`w-12 shrink-0 text-xs font-medium ${
                    game.result === 'win'
                      ? 'text-emerald-400'
                      : game.result === 'loss'
                        ? 'text-red-400'
                        : 'text-zinc-400'
                  }`}
                >
                  {game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw'}
                </span>

                <span className="min-w-0 flex-1 text-sm text-zinc-300 truncate">
                  {game.color === 'white' ? 'White' : 'Black'} vs {game.opponent || 'someone'}
                  {game.openingName && (
                    <span className="text-zinc-600"> · {game.openingName}</span>
                  )}
                </span>

                {/*
                  The clock, or the fact that it has none — which is a thing to go and do
                  rather than a blank, and the one field this page exists to let you set.
                */}
                <span
                  className={`shrink-0 text-xs tabular-nums ${
                    game.timeControl ? 'text-zinc-500' : 'text-amber-400'
                  }`}
                >
                  {game.timeControl ? formatTimeControl(game.timeControl) : 'no clock'}
                </span>

                <span className="shrink-0 text-xs text-zinc-600 w-20 text-right">
                  {endingOf(game)}
                </span>

                <span className="shrink-0 w-24 flex justify-end gap-1">
                  {hasReview(game) && <StatusTag tone="review">◆ reviewed</StatusTag>}
                  {game.analysis && (
                    <StatusTag tone="engine" mono>
                      ⚙ d{game.analysis.depth}
                    </StatusTag>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function UploadsPage() {
  return (
    <PageShell title="Uploaded games" tab="Uploads">
      {user => <UploadsBody userId={user.uid} />}
    </PageShell>
  )
}
