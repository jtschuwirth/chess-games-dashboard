/**
 * One first pass at a time, with the rest of them waiting their turn.
 *
 * Analysing a game from the dashboard means pointing at games from a list, and a list
 * invites pointing at several — so the second click cannot start a second run. There is
 * one Stockfish worker behind `lib/engine`, and two `analyzeGame` calls against it would
 * not merely be slow: whichever finished first calls `terminateEngine` in its `finally`,
 * which rejects everything the other one has in flight. The queue is what makes the
 * button safe to press twice.
 *
 * It lives in a module rather than in a component for the same reason the engine mode
 * does: the work is not the dashboard's state. A run started from a game list has to
 * survive opening one of those games to read it — which is exactly what you do while
 * waiting — and a loop living in a component that unmounted would keep writing to
 * Firestore with nothing on screen to say so.
 *
 * The engine is left running between games on purpose. Starting the worker costs a
 * second, and games from one opening share most of their early positions, so the FEN
 * cache is worth more than a clean slate here; the single-line searches of the first
 * pass do not depend on the hash the way a MultiPV one does. It is terminated when the
 * queue empties.
 */
import {
  AnalysisStopped,
  ENGINE_DEPTH,
  analyzeGame,
  buildAnnotatedPgn,
  type GameAnalysis,
} from './analysis'
import { terminateEngine } from './engine'
import { saveAnalysis } from './firestore'
import type { GameRecord } from '@/types/chess'

/** The game being analysed now, and how far in it is. */
export interface ActiveRun {
  gameId: string
  /** Positions evaluated so far: two per move of yours, as on the game's own page. */
  done: number
  total: number
  /** Measured here rather than in a render, where reading the clock is not allowed. */
  elapsedMs: number
}

export interface QueueState {
  active: ActiveRun | null
  /** Game ids still to be started, in the order they will be. */
  waiting: string[]
  /** Why a run stopped, by game id, until that game is queued again. */
  failed: Record<string, string>
}

/** What a finished run produced. */
export interface Analysed {
  gameId: string
  analysis: GameAnalysis
  annotatedPgn: string
}

const EMPTY: QueueState = { active: null, waiting: [], failed: {} }

/** For the server snapshot, which must be the same object every time it is asked for. */
export const IDLE_QUEUE: QueueState = EMPTY

let state: QueueState = EMPTY
const listeners = new Set<() => void>()

/**
 * Finished analyses go to whoever is listening rather than straight into a page's state.
 *
 * A listener is handed the analysis and the game id, not a `GameRecord`: the queue is
 * holding whatever that game looked like when it was enqueued, and a run takes minutes
 * — long enough for a review to have been written on it meanwhile. Merging onto the
 * current record is the caller's job, as it is for every other edit here.
 */
const watchers = new Set<(result: Analysed) => void>()

interface Job {
  userId: string
  game: GameRecord
}

const jobs: Job[] = []
let draining = false
/** Set by `stop` to abandon the run in progress; read between positions. */
let abandoned = false

function publish(next: QueueState): void {
  state = next
  for (const listener of listeners) listener()
}

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function queueSnapshot(): QueueState {
  return state
}

/** Whether the engine is busy with a first pass, which nothing else should interrupt. */
export function queueBusy(): boolean {
  return state.active !== null
}

export function onAnalysed(watcher: (result: Analysed) => void): () => void {
  watchers.add(watcher)
  return () => watchers.delete(watcher)
}

/** Everything waiting, including whatever is running. */
function queued(gameId: string): boolean {
  return state.active?.gameId === gameId || jobs.some(job => job.game.id === gameId)
}

/**
 * Adds a game to the queue, and starts the queue if it is not already going.
 *
 * Enqueuing a game that is already in there does nothing, so a double click is one run
 * rather than two of the same game.
 */
export function enqueue(userId: string, game: GameRecord): void {
  if (queued(game.id)) return

  jobs.push({ userId, game })

  // a game being tried again should not still be showing why it failed last time
  const failed = { ...state.failed }
  delete failed[game.id]

  publish({ ...state, waiting: jobs.map(job => job.game.id), failed })
  void drain()
}

/**
 * Takes one game out: the one running is abandoned and the queue moves on, one still
 * waiting simply never starts. "Not this one" rather than "stop everything", which is
 * what a control on a row should mean.
 *
 * The game in progress is dropped from the state here rather than when the run actually
 * unwinds. A position takes something over a second and `analyzeGame` only looks at
 * `shouldStop` between them, so waiting for the unwind would leave the control saying
 * "Stop analysing" for a second after being pressed — which reads as a click that
 * missed. The run is already over as far as anything stored goes: a game writes nothing
 * until it is finished.
 */
export function stop(gameId: string): void {
  if (state.active?.gameId === gameId) {
    abandoned = true
    publish({ ...state, active: null })
    return
  }

  const at = jobs.findIndex(job => job.game.id === gameId)
  if (at === -1) return

  jobs.splice(at, 1)
  publish({ ...state, waiting: jobs.map(job => job.game.id) })
}

/** Clears the queue and abandons the run in progress. */
export function stopAll(): void {
  jobs.length = 0
  abandoned = true
  publish({ ...state, active: null, waiting: [] })
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true

  while (jobs.length > 0) {
    const job = jobs.shift() as Job
    abandoned = false

    const startedAt = Date.now()
    let done = 0

    /*
      Silent once the run has been abandoned: the position already in flight still
      reports back when it lands, which would put a game the user has just stopped
      back on screen.
    */
    const progress = () => {
      if (abandoned) return
      publish({
        ...state,
        active: {
          gameId: job.game.id,
          done,
          total: job.game.moves.length,
          elapsedMs: Date.now() - startedAt,
        },
        waiting: jobs.map(waiting => waiting.game.id),
      })
    }

    progress()

    try {
      const analysis = await analyzeGame(job.game, {
        depth: ENGINE_DEPTH,
        onPosition: () => {
          done++
          progress()
        },
        shouldStop: () => abandoned,
      })

      const annotatedPgn = buildAnnotatedPgn(job.game, analysis)
      await saveAnalysis(job.userId, job.game.id, analysis, annotatedPgn)

      for (const watcher of watchers) {
        watcher({ gameId: job.game.id, analysis, annotatedPgn })
      }
    } catch (caught) {
      /*
        One game failing must not take the rest of the queue with it — the point of
        queueing twenty is to leave it running. Abandoning a game on purpose is not a
        failure and leaves nothing behind; anything else is recorded against that game,
        so the row can say what happened and offer to try again.

        `abandoned` is checked as well as the exception type, because stopping is not
        the only way a run ends early: a second pass elsewhere calling
        `terminateEngine` rejects the position in flight with a plain error, and a game
        the user stopped themselves should not then be labelled as having failed.
      */
      if (!(caught instanceof AnalysisStopped) && !abandoned) {
        publish({
          ...state,
          failed: {
            ...state.failed,
            [job.game.id]:
              caught instanceof Error ? caught.message : 'That analysis failed.',
          },
        })
      }
    }
  }

  draining = false
  publish({ ...state, active: null, waiting: [] })
  terminateEngine()
}
