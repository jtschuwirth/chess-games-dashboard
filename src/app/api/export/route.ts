import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { buildExport } from '@/lib/export'
import { isSinceKey, matchesCriteria, type GameCriteria, type SinceKey } from '@/lib/game-filters'
import type { GameRecord, PatternRecord, UserProfile } from '@/types/chess'
import type { Firestore } from 'firebase-admin/firestore'

const DEFAULT_GAME_LIMIT = 200
const MAX_GAME_LIMIT = 2000

function matchesKey(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function deny(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * EXPORT_UID is optional: a single-user install has exactly one document under
 * `users`, so there is nothing to disambiguate. It is only required once a second
 * account has signed in.
 */
async function resolveUserId(db: Firestore): Promise<string> {
  const configured = process.env.EXPORT_UID
  if (configured) return configured

  const users = await db.collection('users').limit(2).get()
  if (users.empty) {
    throw new Error('No user data in Firestore yet — sign in and sync some games first.')
  }
  if (users.size > 1) {
    throw new Error('More than one account stored — set EXPORT_UID in .env.local to pick one.')
  }

  return users.docs[0].id
}

export async function GET(request: Request) {
  const expectedKey = process.env.EXPORT_API_KEY

  // fail closed: without a key configured the endpoint serves nothing
  if (!expectedKey) {
    return deny('Export is disabled — set EXPORT_API_KEY in .env.local to enable it.', 503)
  }

  const provided = request.headers.get('x-api-key') ?? ''
  if (!matchesKey(provided, expectedKey)) {
    return deny('Invalid or missing x-api-key header.', 401)
  }

  const params = new URL(request.url).searchParams
  const limit = Number(params.get('limit') ?? DEFAULT_GAME_LIMIT)

  const rating = (key: string) => {
    const value = Number(params.get(key))
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null
  }

  const since = params.get('since')
  const color = params.get('color')
  const source = params.get('source')
  const review = params.get('review')
  const criteria: GameCriteria = {
    source: source === 'chesscom' || source === 'lichess' ? source : 'both',
    endedIn: params.get('phase') || null,
    mistakes: (['blunder', 'mistake', 'clean', 'analysed'] as const).includes(
      params.get('mistakes') as 'blunder',
    )
      ? (params.get('mistakes') as 'blunder')
      : null,
    reviewed: review === 'yes' || review === 'no' ? review : null,
    tag: params.get('tag') || null,
    color: color === 'white' || color === 'black' ? color : 'both',
    timeControls: (params.get('tc') ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(value => /^\d+\+\d+$/.test(value)),
    since: since && isSinceKey(since) ? (since as SinceKey) : 'all',
    minRating: rating('minElo'),
    maxRating: rating('maxElo'),
  }

  const options = {
    includeGames: params.get('games') !== '0',
    includeMoves: params.get('moves') === '1',
    gameLimit: Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 0), MAX_GAME_LIMIT) : DEFAULT_GAME_LIMIT,
  }

  try {
    const db = getAdminDb()
    const userId = await resolveUserId(db)
    const userRef = db.collection('users').doc(userId)

    const [profileSnap, gamesSnap, patternsSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('games').orderBy('playedAt', 'desc').get(),
      userRef.collection('patterns').get(),
    ])

    const data = profileSnap.data() ?? {}
    const profile: UserProfile = {
      chesscomUsername: data.chesscomUsername ?? null,
      lichessUsername: data.lichessUsername ?? null,
      lastSyncAt: data.lastSyncAt ?? null,
    }

    const now = new Date()
    const games = gamesSnap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }) as GameRecord)
      .filter(game => matchesCriteria(game, criteria, now))
    const patterns = patternsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }) as PatternRecord)

    return NextResponse.json({
      filters: criteria,
      ...buildExport(profile, games, patterns, options),
    })
  } catch (error) {
    console.error('export failed', error)
    return deny(error instanceof Error ? error.message : 'Export failed.', 500)
  }
}
