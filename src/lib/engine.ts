/**
 * Stockfish 19 (lite, single-threaded) in a Web Worker.
 *
 * The single-threaded build is deliberate: the multi-threaded one needs
 * cross-origin isolation headers, which would constrain where this can be hosted.
 *
 * Requests are queued rather than rejected when the engine is busy, because
 * analysing a set of games means thousands of sequential positions.
 *
 * The same positions can be sent to `/api/engine` instead — see `setEngineMode`. That
 * exists for phones, where doing the work locally is slow and the browser suspends the
 * tab the moment you look away.
 */
import {
  MATE_SCORE,
  bestOf,
  type Candidate,
  type Candidates,
  type Evaluation,
} from './engine-protocol'

const WORKER_PATH = '/stockfish-19-lite-single.js'

export { MATE_SCORE, bestOf }
export type { Candidate, Candidates, Evaluation }

/** Where the work happens. */
export type EngineMode = 'browser' | 'server'

const MODE_KEY = 'engine-mode'

interface Job {
  fen: string
  depth: number
  /** How many candidate moves to ask for. 1 is an ordinary evaluation. */
  count: number
  resolve: (value: Candidates) => void
  reject: (error: Error) => void
}

/**
 * The signed-in user's token, so the service can tell it is us. Imported lazily to keep
 * the auth bundle out of anything that only wants an evaluation.
 */
async function idToken(): Promise<string | null> {
  try {
    const { auth } = await import('./firebase')
    return (await auth.currentUser?.getIdToken()) ?? null
  } catch {
    return null
  }
}

let worker: Worker | null = null
let ready: Promise<void> | null = null

const queue: Job[] = []
let running: Job | null = null

/**
 * The best line of each rank so far, rebuilt as the search deepens.
 *
 * A plain search labels nothing and is read as rank 1; a MultiPV one tags every `info`
 * line with its rank. Each rank keeps the deepest line seen, so the map holds the final
 * answer by the time `bestmove` arrives.
 */
const lines = new Map<number, Candidate & { depth: number }>()

const cache = new Map<string, { asked: number; result: Candidates }>()

/** One cache entry per position and depth, holding the richest answer asked for so far. */
function cacheKey(fen: string, depth: number): string {
  return `${fen}@${depth}`
}

function parseInfo(line: string): void {
  // an `info` line with no score - currmove, hashfull, nps - says nothing we want
  let cp: number | null = null

  const score = /score cp (-?\d+)/.exec(line)
  if (score) cp = Number(score[1])

  const mate = /score mate (-?\d+)/.exec(line)
  if (mate) cp = Number(mate[1]) > 0 ? MATE_SCORE : -MATE_SCORE

  if (cp === null) return

  const rank = Number(/\bmultipv\s+(\d+)/.exec(line)?.[1] ?? 1)
  const depth = Number(/\bdepth\s+(\d+)/.exec(line)?.[1] ?? 0)
  const pv = /\bpv\s+(\S+)/.exec(line)

  const seen = lines.get(rank)
  if (seen && seen.depth > depth) return

  lines.set(rank, { rank, cp, uci: pv ? pv[1] : (seen?.uci ?? ''), depth })
}

function finishJob(line: string): void {
  if (!running) return

  const best = /^bestmove\s+(\S+)/.exec(line)
  const job = running
  running = null

  const found = [...lines.values()].sort((a, b) => a.rank - b.rank)
  const depth = found.reduce((deepest, entry) => Math.max(deepest, entry.depth), 0)
  lines.clear()

  if (found.length === 0) {
    job.reject(new Error('Engine returned no score'))
    pump()
    return
  }

  const moves = found.map(({ rank, cp, uci }) => ({ rank, cp, uci }))
  // the engine's own answer wins for the first line, since a pv can arrive truncated
  if (best?.[1]) moves[0] = { ...moves[0], uci: best[1] }

  const result: Candidates = { depth, moves }
  cache.set(cacheKey(job.fen, job.depth), { asked: job.count, result })
  job.resolve(result)

  pump()
}

function handleMessage(event: MessageEvent<string>): void {
  const line = typeof event.data === 'string' ? event.data : String(event.data)

  if (line.startsWith('bestmove')) finishJob(line)
  else if (line.startsWith('info')) parseInfo(line)
}

function pump(): void {
  if (running || queue.length === 0 || !worker) return

  running = queue.shift() as Job
  // set every time rather than only on a change: one message, and no way for a previous
  // job's setting to leak into this one
  worker.postMessage(`setoption name MultiPV value ${running.count}`)
  worker.postMessage(`position fen ${running.fen}`)
  worker.postMessage(`go depth ${running.depth}`)
}

function waitFor(instance: Worker, wanted: string, ms = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      instance.removeEventListener('message', listener)
      reject(new Error(`Stockfish did not answer "${wanted}" in time`))
    }, ms)

    function listener(event: MessageEvent<string>) {
      const line = typeof event.data === 'string' ? event.data : String(event.data)
      if (line.trim() === wanted) {
        clearTimeout(timer)
        instance.removeEventListener('message', listener)
        resolve()
      }
    }

    instance.addEventListener('message', listener)
  })
}

export function initEngine(): Promise<void> {
  if (ready) return ready

  ready = (async () => {
    const instance = new Worker(WORKER_PATH)

    instance.onmessage = handleMessage
    instance.onerror = event => {
      const error = new Error(`Stockfish worker failed: ${event.message}`)
      running?.reject(error)
      running = null
      while (queue.length > 0) queue.shift()?.reject(error)
    }

    instance.postMessage('uci')
    await waitFor(instance, 'uciok')
    instance.postMessage('isready')
    await waitFor(instance, 'readyok')

    worker = instance
  })()

  return ready
}

/**
 * Which engine answers. The browser's is free and private; the server's exists for
 * phones, where the local one is slow and the tab gets suspended the moment you switch
 * app. It is remembered per device, since that is what the choice is really about.
 */
let mode: EngineMode = 'browser'
const modeListeners = new Set<() => void>()

/** Lets a control follow the choice without owning it — see `useSyncExternalStore`. */
export function subscribeEngineMode(listener: () => void): () => void {
  modeListeners.add(listener)
  return () => modeListeners.delete(listener)
}

export function setEngineMode(next: EngineMode): void {
  mode = next
  try {
    window.localStorage.setItem(MODE_KEY, next)
  } catch {
    // private window, or storage blocked: the choice just will not outlive the tab
  }
  if (next === 'server') terminateEngine()
  for (const listener of modeListeners) listener()
}

export function getEngineMode(): EngineMode {
  if (typeof window === 'undefined') return 'browser'

  try {
    const stored = window.localStorage.getItem(MODE_KEY)
    if (stored === 'server' || stored === 'browser') mode = stored
  } catch {
    // fall through to whatever is in memory
  }
  return mode
}

/** Asks `/api/engine`, which runs the same build with the same contract. */
async function searchOnServer(fen: string, depth: number, count: number): Promise<Candidates> {
  const token = await idToken()
  const response = await fetch('/api/engine', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fen, depth, multipv: count }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `The engine service answered ${response.status}.`)
  }

  return (await response.json()) as Candidates
}

/**
 * Queued, so callers can request thousands of positions without coordinating, and
 * cached by position so the two engines share one answer for the same question.
 */
export async function analyzeLines(
  fen: string,
  depth: number,
  count = 1,
): Promise<Candidates> {
  const key = cacheKey(fen, depth)
  const cached = cache.get(key)
  // a search that asked for more lines also answers a request for fewer
  if (cached && cached.asked >= count) return cached.result

  if (getEngineMode() === 'server') {
    const result = await searchOnServer(fen, depth, count)
    cache.set(key, { asked: count, result })
    return result
  }

  await initEngine()

  return new Promise<Candidates>((resolve, reject) => {
    queue.push({ fen, depth, count, resolve, reject })
    pump()
  })
}

/** One position, one answer — what every caller but the second pass wants. */
export async function analyzePosition(fen: string, depth: number): Promise<Evaluation> {
  return bestOf(await analyzeLines(fen, depth))
}

/** Positions repeat heavily across games of the same opening, so this saves real time. */
export function cachedPositions(): number {
  return cache.size
}

export function terminateEngine(): void {
  const error = new Error('Analysis stopped')
  running?.reject(error)
  running = null
  while (queue.length > 0) queue.shift()?.reject(error)

  worker?.terminate()
  worker = null
  ready = null
  lines.clear()
}
