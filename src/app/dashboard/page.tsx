'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Chip from '@/components/Chip'
import GameRow from '@/components/GameRow'
import PageShell, { Spinner } from '@/components/PageShell'
import StatBlockCard from '@/components/StatBlockCard'
import { getGames, getPatterns, setGameIgnored } from '@/lib/firestore'
import { gameMatchesPattern, gamePositionKeys } from '@/lib/pattern'
import { computeSplit } from '@/lib/stats'
import { TIME_CLASSES } from '@/types/chess'
import type { GameRecord, PatternRecord, TimeClass } from '@/types/chess'

const PAGE_SIZE = 50

function DashboardBody({ userId }: { userId: string }) {
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [patterns, setPatterns] = useState<PatternRecord[]>([])
  const [patternId, setPatternId] = useState('all')
  const [timeClasses, setTimeClasses] = useState<TimeClass[]>([])
  const [showIgnored, setShowIgnored] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)

  useEffect(() => {
    getGames(userId).then(setGames)
    getPatterns(userId).then(setPatterns)
  }, [userId])

  /** Every position each game passed through, so switching patterns is instant. */
  const positionKeys = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const game of games ?? []) map.set(game.id, gamePositionKeys(game.moves))
    return map
  }, [games])

  const pattern = patterns.find(p => p.id === patternId) ?? null

  /** Games in the current slice, ignored ones included — stats drop them below. */
  const scoped = useMemo(() => {
    return (games ?? []).filter(game => {
      if (timeClasses.length > 0 && !timeClasses.includes(game.timeClass)) return false
      if (!pattern) return true
      return gameMatchesPattern(game, positionKeys.get(game.id) ?? new Set(), pattern)
    })
  }, [games, timeClasses, pattern, positionKeys])

  const counted = useMemo(() => scoped.filter(game => !game.ignored), [scoped])
  const split = useMemo(() => computeSplit(counted), [counted])
  const listed = showIgnored ? scoped : counted

  async function handleToggleIgnore(game: GameRecord) {
    setBusyId(game.id)
    try {
      await setGameIgnored(userId, game.id, !game.ignored)
      setGames(prev =>
        (prev ?? []).map(item =>
          item.id === game.id ? { ...item, ignored: !item.ignored } : item,
        ),
      )
    } finally {
      setBusyId(null)
    }
  }

  if (games === null) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="py-16 text-center text-zinc-500">
        No games stored yet — link an account and sync from{' '}
        <Link href="/profile" className="underline text-zinc-200">
          Profile &amp; Sync
        </Link>
        .
      </div>
    )
  }

  const ignoredInSlice = scoped.length - counted.length

  return (
    <>
      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Opening</span>
          <select
            value={patternId}
            onChange={event => {
              setPatternId(event.target.value)
              setLimit(PAGE_SIZE)
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
          >
            <option value="all">All games</option>
            {patterns.map(option => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2 flex-wrap items-center">
          <Chip active={timeClasses.length === 0} onClick={() => setTimeClasses([])}>
            all formats
          </Chip>
          {TIME_CLASSES.map(timeClass => (
            <Chip
              key={timeClass}
              active={timeClasses.includes(timeClass)}
              onClick={() =>
                setTimeClasses(prev =>
                  prev.includes(timeClass)
                    ? prev.filter(value => value !== timeClass)
                    : [...prev, timeClass],
                )
              }
            >
              {timeClass}
            </Chip>
          ))}
        </div>

        <p className="text-xs text-zinc-500">
          {pattern
            ? `${counted.length} of ${games.length} stored games followed "${pattern.name}".`
            : `${counted.length} of ${games.length} stored games counted.`}
          {ignoredInSlice > 0 && ` ${ignoredInSlice} ignored game(s) excluded.`}
          {patterns.length === 0 && (
            <>
              {' '}
              <Link href="/patterns" className="underline text-zinc-300">
                Save an opening
              </Link>{' '}
              to filter by line.
            </>
          )}
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <StatBlockCard label="Overall" stats={split.overall} />
        <StatBlockCard label="As White" stats={split.white} />
        <StatBlockCard label="As Black" stats={split.black} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-sm">Games</h2>
          <Chip active={showIgnored} onClick={() => setShowIgnored(prev => !prev)}>
            show ignored
          </Chip>
        </div>

        {listed.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">No games match these filters.</div>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
              {listed.slice(0, limit).map(game => (
                <GameRow
                  key={game.id}
                  game={game}
                  busy={busyId === game.id}
                  onToggleIgnore={handleToggleIgnore}
                />
              ))}
            </div>
            {listed.length > limit && (
              <button
                onClick={() => setLimit(prev => prev + PAGE_SIZE)}
                className="self-center text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Show more ({listed.length - limit} left)
              </button>
            )}
          </>
        )}
      </section>
    </>
  )
}

export default function DashboardPage() {
  return (
    <PageShell title="Dashboard" wide>
      {user => <DashboardBody userId={user.uid} />}
    </PageShell>
  )
}
