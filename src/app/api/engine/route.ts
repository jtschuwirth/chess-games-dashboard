import { NextResponse } from 'next/server'
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

const LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup'

/**
 * Tokens already checked, against when they expire. A single game is eighty requests
 * carrying the same token, and asking Google to re-check it eighty times would add a
 * round trip to every position for nothing.
 */
const verified = new Map<string, number>()

function deny(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Checks a Firebase ID token with Google, rather than with firebase-admin.
 *
 * The admin SDK would be the obvious way, and it cannot be used: `firebase-admin/auth`
 * pulls in jwks-rsa 4.1.0, which declares jose 6 and then `require`s it from CommonJS,
 * so the module fails to load at all under Node. This endpoint needs the public web API
 * key and a fetch, which is what that key is for.
 */
async function verifyToken(token: string): Promise<boolean> {
  const cached = verified.get(token)
  if (cached && cached > Date.now()) return true

  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!key) throw new Error('unconfigured')

  const response = await fetch(`${LOOKUP}?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  })

  if (!response.ok) return false

  // Google hands back the account only for a token that is valid and unexpired
  const body = (await response.json()) as { users?: { localId?: string }[] }
  if (!body.users?.[0]?.localId) return false

  // well inside the hour a Firebase token lasts, so a revoked session is not cached long
  verified.set(token, Date.now() + 5 * 60_000)
  if (verified.size > 50) {
    for (const [key, expiry] of verified) if (expiry < Date.now()) verified.delete(key)
  }
  return true
}

/**
 * Evaluates a position server-side, so a phone does not have to.
 *
 * Gated behind a sign-in for a plain reason: this is the one endpoint that burns real
 * CPU on request, and leaving it open invites strangers to spend the deployment's
 * compute. Without a web API key configured there is no way to check anything, so it
 * refuses rather than running unguarded — the way `/api/export` fails closed.
 */
export async function POST(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return deny('Sign in to use the engine service.', 401)

  try {
    if (!(await verifyToken(token))) return deny('That sign-in was not accepted.', 401)
  } catch {
    return deny('Server-side analysis is not configured on this deployment.', 503)
  }

  let fen: string
  let depth: number
  try {
    const body = (await request.json()) as { fen?: unknown; depth?: unknown }
    if (typeof body.fen !== 'string' || body.fen.trim().length === 0) {
      return deny('Give me a position to look at.', 400)
    }
    fen = body.fen
    depth = Math.min(Math.max(Math.floor(Number(body.depth) || 0), 1), MAX_DEPTH)
  } catch {
    return deny('That request was not JSON.', 400)
  }

  try {
    return NextResponse.json(await analyzeOnServer(fen, depth))
  } catch (error) {
    console.error('engine failed', error)
    return deny(error instanceof Error ? error.message : 'The engine failed.', 500)
  }
}
