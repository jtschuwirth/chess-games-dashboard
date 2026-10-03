/**
 * Stockfish 19 (lite, single-threaded) in a Web Worker.
 *
 * The single-threaded build is deliberate: the multi-threaded one needs
 * cross-origin isolation headers, which would constrain where this can be hosted.
 *
 * Requests are queued rather than rejected when the engine is busy, because
 * analysing a set of games means thousands of sequential positions.
 */

const WORKER_PATH = '/stockfish-19-lite-single.js'

/** A forced mate is worth more than any material count; clamp it so arithmetic still works. */
export const MATE_SCORE = 10000

export interface Evaluation {
  /** Centipawns from the perspective of the side to move. */
  cp: number
  depth: number
  bestMoveUci: string
}

interface Job {
  fen: string
  depth: number
  resolve: (value: Evaluation) => void
  reject: (error: Error) => void
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

/** Queued, so callers can request thousands of positions without coordinating. */
export async function analyzePosition(fen: string, depth: number): Promise<Evaluation> {
  const cached = cache.get(`${fen}@${depth}`)
  if (cached) return cached

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
