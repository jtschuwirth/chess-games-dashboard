import { NextResponse } from 'next/server'
import { deny, requireAdmin } from '@/lib/api-auth'
import { analyzeOnServer } from '@/lib/server-engine'

/** Stockfish is not an edge workload, and the wasm needs a filesystem. */
export const runtime = 'nodejs'

/**
 * One position at depth 21 takes about two seconds warm, plus a cold start. A plan's
 * own ceiling may be lower; this is set high so a slow cold start is not what fails.
 */
export const maxDuration = 60

/** Deeper than this is not useful here, and is an easy way to tie the function up. */
const MAX_DEPTH = 24

/**
 * The second pass asks for a handful of candidate moves; more than this is both slower
 * and no more informative, since the question is only whether one move held or several.
 */
const MAX_LINES = 8

/**
 * Evaluates a position server-side, so a phone does not have to.
 *
 * Restricted to `ADMIN_IDS`, not merely to anyone signed in. This is the one endpoint
 * that burns real CPU per request — a game is eighty positions at depth 21 — so every
 * account that can reach it can spend the deployment's compute, and sign-in is free.
 * Everyone else still has the engine: it runs in their own browser, which is the default.
 */
export async function POST(request: Request) {
  const who = await requireAdmin(request)
  if ('error' in who) return who.error

  let fen: string
  let depth: number
  let lines: number
  try {
    const body = (await request.json()) as {
      fen?: unknown
      depth?: unknown
      multipv?: unknown
    }
    if (typeof body.fen !== 'string' || body.fen.trim().length === 0) {
      return deny('Give me a position to look at.', 400)
    }
    fen = body.fen
    depth = Math.min(Math.max(Math.floor(Number(body.depth) || 0), 1), MAX_DEPTH)
    lines = Math.min(Math.max(Math.floor(Number(body.multipv) || 1), 1), MAX_LINES)
  } catch {
    return deny('That request was not JSON.', 400)
  }

  try {
    return NextResponse.json(await analyzeOnServer(fen, depth, lines))
  } catch (error) {
    console.error('engine failed', error)
    return deny(error instanceof Error ? error.message : 'The engine failed.', 500)
  }
}
