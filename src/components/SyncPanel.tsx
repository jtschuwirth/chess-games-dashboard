'use client'

import { useState } from 'react'
import Link from 'next/link'
import Chip from '@/components/Chip'
import { Spinner } from '@/components/PageShell'
import Panel from '@/components/Section'
import { formatDay } from '@/lib/days'
import { saveGames, saveProfile } from '@/lib/firestore'
import { fetchProviderGames } from '@/lib/sync'
import { SOURCE_LABEL, TIME_CLASSES } from '@/types/chess'
import type { GameRecord, ProviderSource, SyncedGame, TimeClass, UserProfile } from '@/types/chess'

/**
 * Ten is there because it is what a routine sync actually needs.
 *
 * You open the dashboard after an evening's play and want the four games you just
 * finished; fifty is five times over, and not a free five times — `saveGames` rewrites
 * every game it fetches, so a fifty-game sync is fifty document writes to bring in four.
 */
const COUNTS = [10, 50, 100, 200, 500, 1000]
const SOURCES: ProviderSource[] = ['chesscom', 'lichess']

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(v => v !== value) : [...values, value]
}

/**
 * "Sun 5 Oct, 14:20", spelled out rather than handed to `toLocaleString`, which renders
 * differently on the server and in the browser.
 */
function formatMoment(ms: number): string {
  const date = new Date(ms)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDay(ms)}, ${hours}:${minutes}`
}

/**
 * Bringing games in, where you notice they are missing.
 *
 * It lived on the profile page, which meant leaving the dashboard, syncing, and coming
 * back — for the one thing you do most often. It starts folded because it is a control
 * you reach for rather than something to read, and the line it folds down to is the one
 * question you actually have: when did this last run.
 */
export default function SyncPanel({
  userId,
  profile,
  startFolded,
  onSynced,
}: {
  userId: string
  profile: UserProfile
  startFolded?: boolean
  onSynced: (added: GameRecord[]) => void
}) {
  const usernames: Record<ProviderSource, string | null> = {
    chesscom: profile.chesscomUsername,
    lichess: profile.lichessUsername,
  }

  const [sources, setSources] = useState<ProviderSource[]>(['chesscom', 'lichess'])
  const [timeClasses, setTimeClasses] = useState<TimeClass[]>(['blitz', 'rapid'])
  /*
    The first run is seeding an empty dashboard and the rest are topping it up, which
    are different sizes of job. Decided once, at mount, from whether this account has
    ever synced — after that it is an ordinary choice and the chips are right there.
  */
  const [count, setCount] = useState(() => (profile.lastSyncAt ? 10 : 100))
  const [running, setRunning] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [shortfall, setShortfall] = useState(false)

  const active = sources.filter(source => usernames[source])
  const canSync = active.length > 0 && timeClasses.length > 0 && !running

  async function handleSync() {
    setRunning(true)
    setError(null)
    setMessages([])
    setShortfall(false)

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

      const { added, updated } = await saveGames(userId, fetched)
      const syncedAt = Date.now()
      await saveProfile(userId, { lastSyncAt: syncedAt })

      notes.push(
        `Saved ${added.length} new game(s) and refreshed ${updated} already stored.`,
      )

      /*
        What makes a small default safe. If every game fetched was new, the window never
        reached back to anything already stored — so there is no way to know it caught
        everything, whatever number was asked for. Saying so turns "I picked too small a
        number" from something you find out weeks later into something the sync tells you.
      */
      setShortfall(fetched.length > 0 && added.length === fetched.length)

      setMessages(notes)
      onSynced(added)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sync failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Panel
      id="sync"
      title="Sync games"
      startFolded={startFolded}
      meta={profile.lastSyncAt ? `last run ${formatMoment(profile.lastSyncAt)}` : 'never run'}
    >
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
          title="Games already stored are rewritten, so a re-sync also backfills anything added since"
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? 'Syncing…' : 'Sync games'}
        </button>
        {running && <Spinner size="w-4 h-4" />}
        {!running && active.length === 0 && (
          <span className="text-xs text-zinc-500">
            <Link href="/profile" className="underline text-zinc-300">
              Link an account
            </Link>{' '}
            first.
          </span>
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

      {shortfall && (
        <p className="text-xs text-amber-400">
          Every game fetched was new, so this did not reach back to anything already
          stored — there may be more. Sync a larger number to be sure.
        </p>
      )}
    </Panel>
  )
}
