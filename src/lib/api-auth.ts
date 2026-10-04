import { NextResponse } from 'next/server'

/**
 * Who is calling an API route, and whether they are allowed to.
 *
 * One implementation for every route, because a second copy of a token check is a second
 * place for it to be subtly wrong — and they would not share the cache, which is the part
 * that makes it affordable.
 */

const LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup'

/**
 * Tokens already checked, against when they expire and who they belong to.
 *
 * A single game's analysis is eighty requests carrying the same token, and asking Google
 * to re-check it eighty times would add a round trip to every position for nothing. Five
 * minutes is well inside the hour a Firebase token lasts, so a revoked session stops
 * working quickly.
 */
const verified = new Map<string, { uid: string; until: number }>()

const CACHE_MS = 5 * 60_000

export function deny(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/** The bearer token on a request, or empty when there is none. */
export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/**
 * The uid a Firebase ID token belongs to, or null when it is not valid.
 *
 * Checked with Google rather than with firebase-admin: `firebase-admin/auth` pulls in
 * jwks-rsa 4.1.0, which declares jose 6 and then `require`s it from CommonJS, so the
 * module fails to load at all under Node. This needs the public web API key and a fetch,
 * which is what that key is for.
 *
 * Throws when there is no key configured, so a deployment that cannot check anything
 * refuses rather than running unguarded.
 */
export async function uidForToken(token: string): Promise<string | null> {
  const cached = verified.get(token)
  if (cached && cached.until > Date.now()) return cached.uid

  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!key) throw new Error('unconfigured')

  const response = await fetch(`${LOOKUP}?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  })

  if (!response.ok) return null

  // Google hands back the account only for a token that is valid and unexpired
  const body = (await response.json()) as { users?: { localId?: string }[] }
  const uid = body.users?.[0]?.localId
  if (!uid) return null

  verified.set(token, { uid, until: Date.now() + CACHE_MS })
  if (verified.size > 50) {
    for (const [entry, value] of verified) if (value.until < Date.now()) verified.delete(entry)
  }
  return uid
}

/**
 * The accounts allowed to spend this deployment's own resources.
 *
 * `ADMIN_IDS` is a comma-separated list of Firebase uids and is deliberately not
 * `NEXT_PUBLIC_`: it is read on the server only, so the browser bundle never carries it
 * and the client cannot be the thing that decides.
 */
export function adminIds(): string[] {
  return (process.env.ADMIN_IDS ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)
}

export function isAdmin(uid: string): boolean {
  return adminIds().includes(uid)
}

export interface Caller {
  uid: string
}

/**
 * The signed-in caller, or a response to return instead.
 *
 * Routes read as `const who = await requireUser(request); if ('error' in who) return
 * who.error` — which keeps the refusal next to the check rather than three branches
 * further down.
 */
export async function requireUser(
  request: Request,
): Promise<{ uid: string } | { error: NextResponse }> {
  const token = bearerToken(request)
  if (!token) return { error: deny('Sign in first.', 401) }

  let uid: string | null
  try {
    uid = await uidForToken(token)
  } catch {
    return { error: deny('This deployment is not configured to check sign-ins.', 503) }
  }

  if (!uid) return { error: deny('That sign-in was not accepted.', 401) }
  return { uid }
}

/** The signed-in caller, refused unless they are listed in `ADMIN_IDS`. */
export async function requireAdmin(
  request: Request,
): Promise<{ uid: string } | { error: NextResponse }> {
  const who = await requireUser(request)
  if ('error' in who) return who

  if (adminIds().length === 0) {
    return { error: deny('No administrators are configured on this deployment.', 503) }
  }
  if (!isAdmin(who.uid)) {
    return { error: deny('This is restricted to the deployment owner.', 403) }
  }
  return who
}
