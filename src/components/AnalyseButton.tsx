'use client'

import { useSyncExternalStore } from 'react'
import { Spinner } from '@/components/PageShell'
import { ENGINE_DEPTH } from '@/lib/analysis'
import {
  IDLE_QUEUE,
  enqueue,
  queueSnapshot,
  stop,
  subscribeQueue,
  type QueueState,
} from '@/lib/analysis-queue'
import type { GameRecord } from '@/types/chess'

/**
 * What the analysis queue is doing, for anything that needs to follow it.
 *
 * The queue is a module rather than a page's state — the run outlives the list it was
 * started from — which makes it the external-store case, the same as the engine mode
 * toggle and the folded panels. The snapshot is one object replaced on every change, so
 * it is stable between changes and `useSyncExternalStore` settles.
 */
export function useAnalysisQueue(): QueueState {
  return useSyncExternalStore(subscribeQueue, queueSnapshot, () => IDLE_QUEUE)
}

/** Where this game stands with the queue, which is what the control has to say. */
export type QueuePlace =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number; elapsedMs: number }
  /** How many games will be analysed before this one. */
  | { kind: 'waiting'; ahead: number }

export function placeOf(queue: QueueState, gameId: string): QueuePlace {
  if (queue.active?.gameId === gameId) {
    return {
      kind: 'running',
      done: queue.active.done,
      total: queue.active.total,
      elapsedMs: queue.active.elapsedMs,
    }
  }

  const at = queue.waiting.indexOf(gameId)
  if (at !== -1) return { kind: 'waiting', ahead: at + 1 }

  return { kind: 'idle' }
}

/**
 * Run the first pass over this game from wherever it is listed.
 *
 * The analysis used to be reachable only from a game's own page, one game at a time,
 * which is right for a game you are about to read and wrong for the twenty you just
 * synced. Pressing it here is pressing the same button: the same depth, the same code,
 * written back to the same place.
 *
 * Pressing it while one is running queues the game rather than starting it, because
 * there is one engine and two runs against it would fight over the worker. The control
 * then says where in the line the game is, and pressing it again takes it back out.
 */
export default function AnalyseButton({
  userId,
  game,
  className = '',
}: {
  userId: string
  game: GameRecord
  className?: string
}) {
  const queue = useAnalysisQueue()
  const place = placeOf(queue, game.id)
  const failed = queue.failed[game.id]

  if (place.kind === 'running') {
    return (
      <button
        type="button"
        onClick={() => stop(game.id)}
        title="Stop analysing this game — the rest of the queue carries on"
        aria-label={`Being analysed now: ${place.done} of ${place.total} positions. Press to stop.`}
        className={`inline-flex items-center gap-1.5 text-xs font-mono text-violet-300 hover:text-violet-100 transition-colors shrink-0 ${className}`}
      >
        <Spinner size="w-3 h-3" />
        d{ENGINE_DEPTH} {place.done}/{place.total}
      </button>
    )
  }

  if (place.kind === 'waiting') {
    return (
      <button
        type="button"
        onClick={() => stop(game.id)}
        title={`${place.ahead} game${place.ahead === 1 ? '' : 's'} to go first — press to take this one out of the queue`}
        aria-label={`Waiting to be analysed, ${place.ahead} ahead of it. Press to take it out of the queue.`}
        className={`text-xs text-violet-400/70 hover:text-violet-200 transition-colors shrink-0 ${className}`}
      >
        queued · {place.ahead} ahead
      </button>
    )
  }

  const busy = queue.active !== null

  return (
    <button
      type="button"
      onClick={() => enqueue(userId, game)}
      title={
        failed
          ? `${failed} Press to try again.`
          : busy
            ? `Add this game to the queue — it will be analysed at depth ${ENGINE_DEPTH} when the ones before it are done`
            : `Analyse this game at depth ${ENGINE_DEPTH}`
      }
      aria-label={
        failed
          ? `The engine has not analysed this game: ${failed} Press to try again.`
          : `The engine has never looked at this game. Press to analyse it at depth ${ENGINE_DEPTH}.`
      }
      className={`text-xs transition-colors shrink-0 ${
        failed ? 'text-red-400 hover:text-red-300' : 'text-zinc-500 hover:text-violet-300'
      } ${className}`}
    >
      {failed ? '⚙ failed — try again' : busy ? '⚙ queue' : '⚙ analyse'}
    </button>
  )
}
