'use client'

import { useState } from 'react'
import EngineModeToggle from '@/components/EngineMode'
import { Spinner } from '@/components/PageShell'
import { formatDuration } from '@/lib/clocks'
import { AnalysisStopped, ENGINE_DEPTH, analyzeGame, buildAnnotatedPgn } from '@/lib/analysis'
import { terminateEngine } from '@/lib/engine'
import { saveAnalysis } from '@/lib/firestore'
import type { GameRecord } from '@/types/chess'

/**
 * Everything the engine does to this one game, in one place: what it found, where it
 * runs, how to run it, and the annotated PGN that falls out.
 *
 * One game at a time is the whole design. A batch over a filtered slice used to live on
 * the dashboard and was too easy to point at two hundred games; analysis is worth having
 * on the games you are actually going to read, at a depth worth trusting, which is why
 * there is no depth picker either.
 */
export default function EnginePanel({
  userId,
  game,
  onDone,
}: {
  userId: string
  game: GameRecord
  onDone: (game: GameRecord) => void
}) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; elapsedMs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analysed = game.analysis
  const shallower = analysed ? analysed.depth < ENGINE_DEPTH : false

  async function run() {
    setRunning(true)
    setError(null)
    setProgress({ done: 0, elapsedMs: 0 })

    // measured here rather than during render, where reading the clock is not allowed
    const startedAt = Date.now()
    let done = 0

    try {
      const analysis = await analyzeGame(game, {
        depth: ENGINE_DEPTH,
        onPosition: () => {
          done++
          setProgress({ done, elapsedMs: Date.now() - startedAt })
        },
      })

      const pgn = buildAnnotatedPgn(game, analysis)
      await saveAnalysis(userId, game.id, analysis, pgn)
      onDone({ ...game, analysis, annotatedPgn: pgn })
    } catch (caught) {
      if (!(caught instanceof AnalysisStopped)) {
        setError(caught instanceof Error ? caught.message : 'Analysis failed.')
      }
    } finally {
      terminateEngine()
      setRunning(false)
    }
  }

  // two evaluations per move of yours, which is what the progress counts against
  const total = game.moves.length
  const left =
    progress && progress.done > 0
      ? ((total - progress.done) * progress.elapsedMs) / progress.done
      : 0

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Engine</h2>
          {analysed ? (
            <p className="text-sm text-zinc-200">
              <span className="text-red-400 font-mono">{analysed.blunders}</span> blunder
              {analysed.blunders === 1 ? '' : 's'},{' '}
              <span className="text-amber-400 font-mono">{analysed.mistakes}</span> mistake
              {analysed.mistakes === 1 ? '' : 's'}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Not looked at yet.</p>
          )}
        </div>

        <button
          onClick={run}
          disabled={running}
          className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 shrink-0"
        >
          {running
            ? `Analysing… ${progress?.done ?? 0}/${total}`
            : analysed
              ? `Re-analyse at depth ${ENGINE_DEPTH}`
              : `Analyse at depth ${ENGINE_DEPTH}`}
        </button>
      </div>

      {shallower && !running && (
        <p className="text-xs text-amber-400">
          This one was analysed at depth {analysed?.depth}. Re-analysing takes it to{' '}
          {ENGINE_DEPTH}, which is what every number in the review is measured at.
        </p>
      )}

      {running && progress && (
        <p className="text-xs text-zinc-500 flex items-center gap-2">
          <Spinner size="w-3 h-3" />
          {formatDuration(progress.elapsedMs / 1000)} elapsed
          {left > 0 && ` · about ${formatDuration(left / 1000)} left`}
        </p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center justify-between gap-3 flex-wrap border-t border-zinc-800 pt-3">
        <EngineModeToggle />
        {game.annotatedPgn && <CopyPgn pgn={game.annotatedPgn} />}
      </div>
    </section>
  )
}

function CopyPgn({ pgn }: { pgn: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(pgn)
        setCopied(true)
      }}
      className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
    >
      {copied ? 'PGN copied' : 'Copy annotated PGN'}
    </button>
  )
}
