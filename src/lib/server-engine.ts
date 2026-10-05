import { MATE_SCORE, type Candidate, type Candidates } from './engine-protocol'

/**
 * Stockfish running in the Node process behind `/api/engine`, so a phone can have a
 * position analysed without doing the work itself.
 *
 * The same lite single-threaded build the browser uses, driven through the module's
 * `listener` hook — not `print`, which this build never calls, and which cost an hour
 * of wondering why the engine was silent.
 */

const ENGINE = 'stockfish/bin/stockfish-19-lite-single.js'
const WASM_FILE = 'node_modules/stockfish/bin/stockfish-19-lite-single.wasm'

/**
 * Finds the engine's wasm on disk.
 *
 * Not with `require.resolve`, which is the obvious way and does not survive the
 * bundler: anything derived from `createRequire` has its `.resolve` rewritten to return
 * a module id, so the path comes back as the number 4626 and the engine dies with
 * `4626.replace is not a function` — in a production build only, never in dev.
 *
 * So: look where it can actually be. The working directory is where a serverless
 * function's traced files land, and the module's own location covers the rest. Each
 * candidate is checked rather than assumed, and the error names what was tried, because
 * this is the one failure that would only ever show up once deployed.
 */
async function findWasm(): Promise<string> {
  const { existsSync } = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')

  const candidates = [path.join(process.cwd(), WASM_FILE)]

  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let up = 0; up < 8; up++) {
    candidates.push(path.join(dir, WASM_FILE))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  const found = candidates.find(candidate => existsSync(candidate))
  if (found) return found

  throw new Error(`Could not find the engine's wasm. Looked in:\n${candidates.join('\n')}`)
}

/** Long enough that a slow cold start is not mistaken for a hung search. */
const SEARCH_TIMEOUT = 60_000

interface EngineModule {
  ccall: (
    name: string,
    returns: string | null,
    types: string[],
    args: unknown[],
    options?: { async?: boolean },
  ) => unknown
}

let engine: Promise<EngineModule> | null = null
let listener: (line: string) => void = () => {}

/**
 * One engine per process, reused while the function stays warm. Loading costs about
 * 100ms, so this matters less than it looks, but a warm engine also keeps its hash.
 */
function load(): Promise<EngineModule> {
  if (engine) return engine

  engine = (async () => {
    // required at call time: the engine bundle reaches for `self` when a bundler
    // evaluates it eagerly, so it must stay outside the module graph
    const { createRequire } = await import('node:module')
    const nodeRequire = createRequire(import.meta.url)
    const init = nodeRequire(ENGINE) as () => (options: unknown) => Promise<EngineModule>

    const wasm = await findWasm()
    return init()({
      locateFile: (file: string) => (file.endsWith('.wasm') ? wasm : file),
      listener: (line: string) => listener(line),
    })
  })()

  return engine
}

function send(instance: EngineModule, command: string): void {
  instance.ccall('command', null, ['string'], [command], { async: /^go\b/.test(command) })
}

/**
 * Searches one position, from the point of view of the side to move — the same contract
 * as the browser engine, so callers cannot tell which one answered.
 *
 * `count` above 1 turns on MultiPV, which is how the second pass asks "how many moves
 * held this?" in a single search rather than one search per candidate move.
 */
export async function analyzeOnServer(
  fen: string,
  depth: number,
  count = 1,
): Promise<Candidates> {
  const instance = await load()

  return new Promise<Candidates>((resolve, reject) => {
    const lines = new Map<number, Candidate & { depth: number }>()

    const timer = setTimeout(() => {
      listener = () => {}
      reject(new Error('The engine did not finish in time.'))
    }, SEARCH_TIMEOUT)

    listener = line => {
      if (typeof line !== 'string') return

      const bestmove = /^bestmove\s+(\S+)/.exec(line)
      if (!bestmove) {
        let cp: number | null = null

        const score = /score cp (-?\d+)/.exec(line)
        if (score) cp = Number(score[1])

        const mate = /score mate (-?\d+)/.exec(line)
        if (mate) cp = Number(mate[1]) > 0 ? MATE_SCORE : -MATE_SCORE

        // an `info` line with no score says nothing we want
        if (cp === null) return

        const rank = Number(/\bmultipv\s+(\d+)/.exec(line)?.[1] ?? 1)
        const reached = Number(/\bdepth\s+(\d+)/.exec(line)?.[1] ?? 0)
        const pv = /\bpv\s+(\S+)/.exec(line)

        const seen = lines.get(rank)
        if (seen && seen.depth > reached) return

        lines.set(rank, { rank, cp, uci: pv ? pv[1] : (seen?.uci ?? ''), depth: reached })
        return
      }

      clearTimeout(timer)
      listener = () => {}

      const found = [...lines.values()].sort((a, b) => a.rank - b.rank)
      if (found.length === 0) {
        reject(new Error('The engine returned no score.'))
        return
      }

      const moves = found.map(({ rank, cp, uci }) => ({ rank, cp, uci }))
      if (bestmove[1]) moves[0] = { ...moves[0], uci: bestmove[1] }

      resolve({
        depth: found.reduce((deepest, entry) => Math.max(deepest, entry.depth), 0),
        moves,
      })
    }

    send(instance, `setoption name MultiPV value ${count}`)
    send(instance, `position fen ${fen}`)
    send(instance, `go depth ${depth}`)
  })
}
