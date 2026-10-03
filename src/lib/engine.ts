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
import { MATE_SCORE, type Evaluation } from './engine-protocol'

const WORKER_PATH = '/stockfish-19-lite-single.js'

export { MATE_SCORE }
export type { Evaluation }

/** Where the work happens. */
export type EngineMode = 'browser' | 'server'

const MODE_KEY = 'engine-mode'

interface Job {
  fen: string
  depth: number
  resolve: (value: Evaluation) => void
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

// parsed from the `info` lines as the search deepens
let bestCp: number | null = null
let bestMove = ''
let reachedDepth = 0

const cache = new Map<string, Evaluation>()

function parseInfo(line: string): void {
  const cp = /score cp (-?\d+)/.exec(line)
  if (cp) bestCp = Number(cp[1])

  const mate = /score mate (-?\d+)/.exec(line)
  if (mate) bestCp = Number(mate[1]) > 0 ? MATE_SCORE : -MATE_SCORE

  const pv = /\bpv\s+(\S+)/.exec(line)
  if (pv) bestMove = pv[1]

  const depth = /\bdepth\s+(\d+)/.exec(line)
  if (depth) reachedDepth = Number(depth[1])
}

function finishJob(line: string): void {
  if (!running) return

  const best = /^bestmove\s+(\S+)/.exec(line)
  const job = running

  running = null
  const result =
    bestCp === null
      ? null
      : { cp: bestCp, depth: reachedDepth, bestMoveUci: best ? best[1] : bestMove }

  bestCp = null
  bestMove = ''
  reachedDepth = 0

  if (result) {
    cache.set(`${job.fen}@${job.depth}`, result)
    job.resolve(result)
  } else {
    job.reject(new Error('Engine returned no score'))
  }

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
async function analyzeOnServer(fen: string, depth: number): Promise<Evaluation> {
  const token = await idToken()
  const response = await fetch('/api/engine', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fen, depth }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `The engine service answered ${response.status}.`)
  }

  return (await response.json()) as Evaluation
}

/**
 * Queued, so callers can request thousands of positions without coordinating, and
 * cached by position so the two engines share one answer for the same question.
 */
export async function analyzePosition(fen: string, depth: number): Promise<Evaluation> {
  const key = `${fen}@${depth}`
  const cached = cache.get(key)
  if (cached) return cached

  if (getEngineMode() === 'server') {
    const result = await analyzeOnServer(fen, depth)
    cache.set(key, result)
    return result
  }

  await initEngine()

  return new Promise<Evaluation>((resolve, reject) => {
    queue.push({ fen, depth, resolve, reject })
    pump()
  })
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
  bestCp = null
  bestMove = ''
  reachedDepth = 0
}
