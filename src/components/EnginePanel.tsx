'use client'

import { useState } from 'react'
import EngineModeToggle from '@/components/EngineMode'
import { Spinner } from '@/components/PageShell'
import { formatDuration } from '@/lib/clocks'
import {
  AnalysisStopped,
  ENGINE_DEPTH,
  analyzeGame,
  buildAnnotatedPgn,
  giftsFrom,
} from '@/lib/analysis'
import { terminateEngine } from '@/lib/engine'
import { dismissVerdict, saveAnalysis, saveVerdicts } from '@/lib/firestore'
import { formatEval, isFault } from '@/lib/review'
import {
  STANDING_BADGE,
  STANDING_LABEL,
  VERDICT_LABEL,
  breadthOf,
  imbalanceAt,
  judgeGame,
  materialGlyphs,
  materialLabel,
  pendingPlies,
  standingOf,
  verdictHint,
  verdictsOf,
} from '@/lib/verdict'
import type { Color, GameRecord, MoveVerdict } from '@/types/chess'

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
  const [judging, setJudging] = useState<{ done: number; total: number } | null>(null)

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

  /**
   * The second pass: for each move the engine marked, what kind of mistake it was.
   *
   * One MultiPV search per marked move, at the same depth as everything else, so the
   * candidates it counts are comparable with each other and with the first pass.
   */
  async function judge(force: boolean) {
    const count = force ? marked.length : pendingPlies(game).length
    setError(null)
    setJudging({ done: 0, total: count })

    try {
      const judged = await judgeGame(game, {
        force,
        onProgress: (done, total) => setJudging({ done, total }),
      })

      await saveVerdicts(userId, game.id, judged)
      onDone({ ...game, verdicts: { ...verdictsOf(game), ...judged } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That pass failed.')
    } finally {
      terminateEngine()
      setJudging(null)
    }
  }

  async function setDismissed(ply: number, dismissed: boolean) {
    const stored = verdictsOf(game)[String(ply)]
    if (!stored) return

    // on screen first, then the write, the same as every other edit here
    onDone({
      ...game,
      verdicts: { ...verdictsOf(game), [String(ply)]: { ...stored, dismissed } },
    })

    try {
      await dismissVerdict(userId, game.id, ply, dismissed)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not save.')
    }
  }

  const marked = (game.analysis?.moves ?? []).filter(move => isFault(move.tag))
  // read out of the analysis already stored: no extra search, nothing new saved
  const gifts = giftsFrom(game)
  const stored = verdictsOf(game)
  const pending = pendingPlies(game)

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

      {marked.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-xs uppercase tracking-wide text-zinc-500">
              What each one was
            </h3>
            <button
              onClick={() => judge(pending.length === 0)}
              disabled={judging !== null || running}
              className="px-3 py-1 text-xs font-medium border border-zinc-700 text-zinc-200 rounded-lg hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-40"
            >
              {judging
                ? `Reading… ${judging.done}/${judging.total}`
                : pending.length === 0
                  ? `Read all ${marked.length} again`
                  : `Read ${pending.length} marked move${pending.length === 1 ? '' : 's'}`}
            </button>
          </div>

          {gifts.length > 0 && (
            <p className="text-xs text-zinc-600">
              Your opponent handed you a won position {gifts.length} time
              {gifts.length === 1 ? '' : 's'}:{' '}
              <span className="font-mono text-zinc-500">
                {gifts.map(gift => `${gift.moveNumber}...${gift.san}`).join(', ')}
              </span>
            </p>
          )}

          <div className="flex flex-col divide-y divide-zinc-800/70">
            {marked.map(move => (
              <VerdictRow
                key={move.ply}
                move={move}
                color={game.color}
                verdict={stored[String(move.ply)]}
                onDismiss={dismissed => setDismissed(move.ply, dismissed)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap border-t border-zinc-800 pt-3">
        <EngineModeToggle />
        {game.annotatedPgn && <CopyPgn pgn={game.annotatedPgn} />}
      </div>
    </section>
  )
}

/**
 * One marked move and what the second pass made of it.
 *
 * The ingredients are on the row beside the verdict — material, and how many of the
 * candidates held — because the verdict is a judgement and you should be able to see
 * what it was made from before you accept it. `×` says you do not; the row stays, greyed,
 * so the reading is on record as rejected rather than quietly gone.
 */
function VerdictRow({
  move,
  color,
  verdict,
  onDismiss,
}: {
  /** The stored shape, whose tag is a plain string — see `StoredAnalysis`. */
  move: NonNullable<GameRecord['analysis']>['moves'][number]
  color: Color
  verdict?: MoveVerdict
  onDismiss: (dismissed: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const dismissed = verdict?.dismissed === true
  const imbalance = verdict ? imbalanceAt(verdict) : undefined
  const standing = standingOf(move.cpBefore)
  const landed = standingOf(move.cpAfter)
  const breadth = breadthOf(verdict?.holds ?? 0)

  return (
    <div className={`flex items-center gap-3 py-1.5 flex-wrap ${dismissed ? 'opacity-40' : ''}`}>
      <span className="font-mono text-xs text-zinc-300 w-24 shrink-0">
        {move.moveNumber}. {move.san}
        <span className={move.tag === '??' ? 'text-red-400' : 'text-amber-400'}> {move.tag}</span>
      </span>

      <span className="font-mono text-xs text-zinc-500 w-28 shrink-0">
        {formatEval(move.cpBefore, color)} → {formatEval(move.cpAfter, color)}
      </span>

      {verdict ? (
        <>
          <span
            title={verdictHint(standing, landed, breadth)}
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
              STANDING_BADGE[standing]
            }`}
          >
            {VERDICT_LABEL[verdict.verdict]}
          </span>

          {/* the two axes the descriptor is the name of, so the badge can be checked */}
          <span className="text-xs text-zinc-500">
            {STANDING_LABEL[standing]} → {STANDING_LABEL[landed]} · {breadth}{' '}
            <span className="text-zinc-600">
              {verdict.holds}/{verdict.looked}
            </span>
          </span>

          {/* figurines to scan, the sentence on hover */}
          <span className="text-xs text-zinc-400" title={materialLabel(imbalance)}>
            {materialGlyphs(imbalance)}
          </span>

          {(verdict.candidates?.length ?? 0) > 0 && (
            <button
              onClick={() => setOpen(!open)}
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              {open ? 'hide' : 'what held'}
            </button>
          )}

          <button
            onClick={() => onDismiss(!dismissed)}
            title={dismissed ? 'Put this reading back' : 'This reading is wrong'}
            className="ml-auto text-xs text-zinc-700 hover:text-zinc-300 transition-colors shrink-0"
          >
            {dismissed ? '↺' : '✕'}
          </button>

          {open && (
            <div className="basis-full flex gap-3 flex-wrap pl-24 pb-1">
              {verdict.candidates?.map((candidate, index) => (
                <span
                  key={index}
                  className={`font-mono text-xs ${
                    candidate.holds ? 'text-emerald-300' : 'text-zinc-600'
                  }`}
                  title={candidate.holds ? 'holds the position' : 'gives something away too'}
                >
                  {candidate.san}{' '}
                  <span className="text-zinc-600">{formatEval(candidate.cp, color)}</span>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className="text-xs text-zinc-700">not read yet</span>
      )}
    </div>
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
