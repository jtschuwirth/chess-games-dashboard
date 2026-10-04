'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Chip from '@/components/Chip'
import DrillCardView from '@/components/DrillCard'
import EngineModeToggle from '@/components/EngineMode'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import { terminateEngine } from '@/lib/engine'
import { readFilters, writeFilters } from '@/lib/dashboard-filters'
import { getGames, getOpenings } from '@/lib/firestore'
import { buildOpeningTree } from '@/lib/opening'
import { positionKeyMap, scopeGames } from '@/lib/scope'
import { buildDrillCards, drillProgress, isDrillSource, type DrillSource } from '@/lib/drill'
import type { DrillStat, GameRecord, OpeningLine } from '@/types/chess'

const SOURCES: { value: DrillSource; label: string; hint: string }[] = [
  {
    value: 'reviewed',
    label: 'from my reviews',
    hint: 'Positions you have taken apart and written alternatives for',
  },
  {
    value: 'all',
    label: 'from every flagged mistake',
    hint: 'Adds the blunders and mistakes you never got round to reviewing',
  },
]

function pct(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`
}

function LearnBody({ userId }: { userId: string }) {
  const searchParams = useSearchParams()
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [openings, setOpenings] = useState<OpeningLine[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [source, setSource] = useState<DrillSource>(() => {
    const raw = searchParams.get('from')
    return raw && isDrillSource(raw) ? raw : 'reviewed'
  })
  const [index, setIndex] = useState(0)
  /** This session's attempts, so answering never re-sorts the queue under you. */
  const [results, setResults] = useState<Record<string, DrillStat>>({})

  const filters = useMemo(() => readFilters(searchParams), [searchParams])

  /** The dashboard's filters still apply, so you can drill one branch of the repertoire. */
  const search = useMemo(() => {
    const query = new URLSearchParams(writeFilters(filters).replace(/^\?/, ''))
    if (source !== 'reviewed') query.set('from', source)
    const text = query.toString()
    return text ? `?${text}` : ''
  }, [filters, source])

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname + search)
  }, [search])

  /** The worker holds a few megabytes of wasm; nothing needs it once you leave. */
  useEffect(() => () => terminateEngine(), [])

  const load = useCallback(
    (options?: { fresh: true }) =>
      Promise.all([getGames(userId, options), getOpenings(userId, options)])
        .then(([loadedGames, loadedOpenings]) => {
          setGames(loadedGames)
          setOpenings(loadedOpenings)
          setLoadError(null)
        })
        .catch(caught => setLoadError(errorText(caught, 'Could not load your games.'))),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  const tree = useMemo(() => buildOpeningTree(openings), [openings])
  const keys = useMemo(() => positionKeyMap(games ?? []), [games])
  const scoped = useMemo(
    () => scopeGames(games ?? [], tree, keys, filters),
    [games, tree, keys, filters],
  )

  /** Built once per selection; this session's answers are layered on top, not re-sorted. */
  const queue = useMemo(() => buildDrillCards(scoped, source), [scoped, source])
  const cards = useMemo(
    () => queue.map(card => ({ ...card, stat: results[card.key] ?? card.stat })),
    [queue, results],
  )

  const progress = useMemo(() => drillProgress(cards), [cards])
  const answered = Object.values(results)
  const sessionCorrect = answered.filter(stat => stat.lastCorrect).length

  function restart() {
    setIndex(0)
    setResults({})
  }

  function pick(next: DrillSource) {
    setSource(next)
    setIndex(0)
  }

  if (loadError) {
    return (
      <LoadError
        message={loadError}
        onRetry={() => {
          setLoadError(null)
          load({ fresh: true })
        }}
      />
    )
  }

  if (games === null) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  const current = cards[index] ?? null

  return (
    <>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {SOURCES.map(option => (
              <Chip
                key={option.value}
                active={source === option.value}
                onClick={() => pick(option.value)}
                title={option.hint}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <EngineModeToggle />
            <Link
              href={`/dashboard${writeFilters(filters)}`}
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Change the filters →
            </Link>
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          {progress.positions} position{progress.positions === 1 ? '' : 's'} from{' '}
          {scoped.length} filtered game{scoped.length === 1 ? '' : 's'} · {progress.tried} tried ·{' '}
          {progress.sticking} sticking
          {answered.length > 0 && (
            <>
              {' '}
              · <span className="text-zinc-300">this session {sessionCorrect}/{answered.length}</span>
            </>
          )}
        </p>
      </section>

      {current ? (
        <DrillCardView
          key={current.key}
          userId={userId}
          card={current}
          position={index + 1}
          total={cards.length}
          onAnswered={(stat, correct) => {
            void correct
            setResults(prev => ({ ...prev, [current.key]: stat }))
          }}
          onNext={() => setIndex(value => value + 1)}
        />
      ) : cards.length === 0 ? (
        <div className="py-16 text-center text-zinc-500 flex flex-col items-center gap-2">
          <p>
            {source === 'reviewed'
              ? 'No reviewed positions in this slice yet.'
              : 'No flagged mistakes in this slice yet.'}
          </p>
          <p className="text-xs text-zinc-600">
            {source === 'reviewed' ? (
              <>
                Take a game apart on the{' '}
                <Link href={`/dashboard${writeFilters(filters)}`} className="underline">
                  dashboard
                </Link>
                , or drill from every flagged mistake instead.
              </>
            ) : (
              <>
                Run the engine over a slice of games from the{' '}
                <Link href={`/dashboard${writeFilters(filters)}`} className="underline">
                  dashboard
                </Link>{' '}
                first.
              </>
            )}
          </p>
        </div>
      ) : (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 items-start">
          <h2 className="font-semibold text-sm">That is the lot</h2>
          <p className="text-sm text-zinc-400">
            {answered.length > 0
              ? `You found something that holds in ${sessionCorrect} of ${answered.length}.`
              : 'Nothing attempted this time.'}
          </p>
          <button
            onClick={restart}
            className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors"
          >
            Go round again
          </button>
        </section>
      )}

      {progress.byTag.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-semibold text-sm">What is sticking</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Your drill record by the tags you gave these mistakes, worst first. A tag you keep
              missing is the one worth studying away from the board.
            </p>
          </div>

          <div className="flex flex-col">
            <div className="grid grid-cols-[1fr_4rem_4rem_4rem] gap-2 px-2 pb-1.5 text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
              <span>Opening</span>
              <span className="text-right">Found</span>
              <span className="text-right">Tries</span>
              <span className="text-right">New</span>
            </div>
            {progress.byTag.map(score => (
              <div
                key={score.tag}
                className="grid grid-cols-[1fr_4rem_4rem_4rem] gap-2 px-2 py-2 text-sm border-b border-zinc-800/60"
              >
                <span className="text-zinc-100 min-w-0 truncate">{score.tag}</span>
                <span
                  className={`text-right tabular-nums ${
                    score.attempts === 0
                      ? 'text-zinc-600'
                      : score.correct / score.attempts < 0.5
                        ? 'text-red-400'
                        : 'text-emerald-400'
                  }`}
                >
                  {pct(score.correct, score.attempts)}
                </span>
                <span className="text-right tabular-nums text-zinc-400">{score.attempts}</span>
                <span className="text-right tabular-nums text-zinc-600">{score.untried}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export default function LearnPage() {
  return (
    <PageShell title="Learn from your mistakes" wide>
      {user => (
        <Suspense
          fallback={
            <div className="py-16 flex justify-center">
              <Spinner size="w-6 h-6" />
            </div>
          }
        >
          <LearnBody userId={user.uid} />
        </Suspense>
      )}
    </PageShell>
  )
}
