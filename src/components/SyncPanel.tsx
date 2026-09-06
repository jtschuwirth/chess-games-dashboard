'use client'

import { useState } from 'react'
import Chip from '@/components/Chip'
import { Spinner } from '@/components/PageShell'
import { saveGames, saveProfile } from '@/lib/firestore'
import { fetchProviderGames } from '@/lib/sync'
import { SOURCE_LABEL, TIME_CLASSES } from '@/types/chess'
import type { GameRecord, Source, SyncedGame, TimeClass, UserProfile } from '@/types/chess'

const COUNTS = [25, 50, 100, 200, 500]
const SOURCES: Source[] = ['chesscom', 'lichess']

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(v => v !== value) : [...values, value]
}

export default function SyncPanel({
  userId,
  profile,
  onSynced,
}: {
  userId: string
  profile: UserProfile
  onSynced: (added: GameRecord[]) => void
}) {
  const usernames: Record<Source, string | null> = {
    chesscom: profile.chesscomUsername,
    lichess: profile.lichessUsername,
  }

  const [sources, setSources] = useState<Source[]>(['chesscom', 'lichess'])
  const [timeClasses, setTimeClasses] = useState<TimeClass[]>(['blitz', 'rapid'])
  const [count, setCount] = useState(100)
  const [running, setRunning] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const active = sources.filter(source => usernames[source])
  const canSync = active.length > 0 && timeClasses.length > 0 && !running

  async function handleSync() {
    setRunning(true)
    setError(null)
    setMessages([])

    try {
      const fetched: SyncedGame[] = []
      const notes: string[] = []

      for (const source of active) {
        const { games, warnings } = await fetchProviderGames(
          source,
          usernames[source] as string,
          count,
          timeClasses,
        )
        fetched.push(...games)
        notes.push(`${SOURCE_LABEL[source]}: fetched ${games.length} game(s).`, ...warnings)
      }

      const { added, skipped } = await saveGames(userId, fetched)
      const syncedAt = Date.now()
      await saveProfile(userId, { lastSyncAt: syncedAt })

      notes.push(`Saved ${added.length} new game(s); ${skipped} were already stored.`)
      setMessages(notes)
      onSynced(added)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sync failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-5">
      <div>
        <h2 className="font-semibold">Sync games</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Pulls your most recent games. Games already stored are left alone, so anything you
          ignored stays ignored.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Accounts</span>
        <div className="flex gap-2 flex-wrap">
          {SOURCES.map(source => (
            <Chip
              key={source}
              active={sources.includes(source)}
              disabled={!usernames[source]}
              onClick={() => setSources(prev => toggle(prev, source))}
              title={usernames[source] ? `${usernames[source]}` : 'Add a username first'}
            >
              {SOURCE_LABEL[source]}
              {usernames[source] ? ` · ${usernames[source]}` : ' · not linked'}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Time formats</span>
        <div className="flex gap-2 flex-wrap">
          {TIME_CLASSES.map(timeClass => (
            <Chip
              key={timeClass}
              active={timeClasses.includes(timeClass)}
              onClick={() => setTimeClasses(prev => toggle(prev, timeClass))}
            >
              {timeClass}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          How many games per account
        </span>
        <div className="flex gap-2 flex-wrap">
          {COUNTS.map(value => (
            <Chip key={value} active={count === value} onClick={() => setCount(value)}>
              last {value}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={!canSync}
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? 'Syncing…' : 'Sync games'}
        </button>
        {running && <Spinner size="w-4 h-4" />}
        {!running && active.length === 0 && (
          <span className="text-xs text-zinc-500">Save a username above first.</span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {messages.length > 0 && (
        <ul className="text-xs text-zinc-400 flex flex-col gap-1">
          {messages.map((message, i) => (
            <li key={i}>· {message}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
