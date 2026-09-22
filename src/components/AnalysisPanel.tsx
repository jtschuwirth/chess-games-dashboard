'use client'

import { useRef, useState } from 'react'
import Chip from '@/components/Chip'
import { Spinner } from '@/components/PageShell'
import { AnalysisStopped, analyzeGame, buildAnnotatedPgn } from '@/lib/analysis'
import { cachedPositions, terminateEngine } from '@/lib/engine'
import { saveAnalysis } from '@/lib/firestore'
import type { GameRecord, StoredAnalysis } from '@/types/chess'

const DEPTHS = [10, 12, 14, 16]

/** Re-rendering on every position would swamp the main thread; this is often enough. */
const PROGRESS_EVERY = 25

interface Progress {
  done: number
  total: number
  positions: number
  /** Measured when the snapshot is taken — reading the clock during render is not allowed. */
  elapsedMs: number
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/**
 * Runs Stockfish over whatever the dashboard filters currently select, so you can
 * analyse one branch of the repertoire — every Caro-Kann, say — in one go.
 *
 * The engine runs in a worker in this tab, so the work stops if the tab closes.
 * Each game is saved as it finishes, so stopping loses at most one game.
 */
export default function AnalysisPanel({
  userId,
  games,
  onAnalyzed,
}: {
  userId: string
  games: GameRecord[]
  onAnalyzed: (gameId: string, analysis: StoredAnalysis, annotatedPgn: string) => void
}) {
  const [depth, setDepth] = useState(12)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef(false)

  const pending = games.filter(game => !game.analysis || game.analysis.depth < depth)
  const analysed = games.length - pending.length

  async function run() {
    stop.current = false
    setError(null)
    setRunning(true)

    const startedAt = Date.now()
    let positions = 0
    let done = 0
    const snapshot = () => ({
      done,
      total: pending.length,
      positions,
      elapsedMs: Date.now() - startedAt,
    })
    setProgress(snapshot())

    try {
      for (const game of pending) {
        if (stop.current) break

        const analysis = await analyzeGame(game, {
          depth,
          shouldStop: () => stop.current,
          onPosition: () => {
            positions++
            if (positions % PROGRESS_EVERY === 0) setProgress(snapshot())
          },
        })

        const pgn = buildAnnotatedPgn(game, analysis)
        await saveAnalysis(userId, game.id, analysis, pgn)
        onAnalyzed(game.id, analysis, pgn)

        done++
        setProgress(snapshot())
      }
    } catch (caught) {
      if (!(caught instanceof AnalysisStopped)) {
        setError(caught instanceof Error ? caught.message : 'Analysis failed.')
      }
    } finally {
      terminateEngine()
      setRunning(false)
    }
  }

  const rate = progress && progress.elapsedMs > 0 ? progress.positions / (progress.elapsedMs / 1000) : 0
  const remaining =
    progress && rate > 0 && progress.done > 0
      ? ((progress.total - progress.done) * (progress.positions / progress.done)) / rate
      : 0

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-sm">Engine analysis</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Runs Stockfish over the {games.length} game{games.length === 1 ? '' : 's'} currently
          filtered and writes the annotations onto each game. Runs in this tab, so leave it open.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wide text-zinc-500 mr-1">Depth</span>
        {DEPTHS.map(value => (
          <Chip
            key={value}
            active={depth === value}
            disabled={running}
            onClick={() => setDepth(value)}
            title={value <= 12 ? 'Faster, good enough for blunders' : 'Slower, more reliable'}
          >
            {value}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {running ? (
          <>
            <button
              onClick={() => {
                stop.current = true
              }}
              className="px-4 py-2 text-sm font-medium bg-zinc-700 text-zinc-100 rounded-lg hover:bg-zinc-600 transition-colors"
            >
              Stop
            </button>
            <Spinner size="w-4 h-4" />
          </>
        ) : (
          <button
            onClick={run}
            disabled={pending.length === 0}
            className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending.length === 0
              ? 'All analysed at this depth'
              : `Analyse ${pending.length} game${pending.length === 1 ? '' : 's'}`}
          </button>
        )}

        {analysed > 0 && (
          <span className="text-xs text-zinc-500">
            {analysed} of {games.length} already done at depth {depth} or better
          </span>
        )}
      </div>

      {progress && (
        <div className="flex flex-col gap-2">
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
          <div className="text-xs text-zinc-500 flex gap-3 flex-wrap">
            <span>
              {progress.done} / {progress.total} games
            </span>
            <span>{progress.positions} positions</span>
            {rate > 0 && <span>{rate.toFixed(1)}/s</span>}
            <span>{duration(progress.elapsedMs)} elapsed</span>
            {running && remaining > 0 && <span>~{duration(remaining * 1000)} left</span>}
            <span className="text-zinc-600">{cachedPositions()} cached</span>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  )
}
