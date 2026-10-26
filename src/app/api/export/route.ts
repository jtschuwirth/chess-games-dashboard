import { NextResponse } from 'next/server'
import { deny, requireUser } from '@/lib/api-auth'
import { getAdminDb } from '@/lib/firebase-admin'
import { buildExport } from '@/lib/export'
import { isSinceKey, matchesCriteria, type GameCriteria, type SinceKey } from '@/lib/game-filters'
import { normalizeOpening } from '@/lib/opening'
import { applyTagGroups, normalizeTagGroups } from '@/lib/tags'
import type { GameRecord, OpeningLine, UserProfile } from '@/types/chess'

const DEFAULT_GAME_LIMIT = 200
const MAX_GAME_LIMIT = 2000

/**
 * Your own data, as JSON.
 *
 * Authenticated with the Firebase ID token of whoever is asking, and it returns that
 * account's data and no one else's. It used to be a shared `EXPORT_API_KEY` plus an
 * `EXPORT_UID` naming whose data to hand over, which is two things to configure, one
 * secret to leak, and a design that could only ever serve one person. A token is already
 * what the browser holds, so there is nothing new to manage and nothing to leak.
 *
 * It still needs the Admin SDK: the route runs outside any session, and Firestore rules
 * scope every document to its owner, so the client SDK could read nothing here. The uid
 * from the token is what makes that safe — the route reads one user's tree, the one that
 * asked.
 */
export async function GET(request: Request) {
  const who = await requireUser(request)
  if ('error' in who) return who.error

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
    // `arc:held` or `name:a clean win`; an unknown value is simply no filter
    shape: params.get('shape') || null,
    mistakes: (['blunder', 'mistake', 'clean', 'analysed', 'unanalysed'] as const).includes(
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
    const userRef = db.collection('users').doc(who.uid)

    const [profileSnap, gamesSnap, openingsSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('games').orderBy('playedAt', 'desc').get(),
      userRef.collection('patterns').get(),
    ])

    const data = profileSnap.data() ?? {}

    /*
     * The account's own vocabulary, before anything counts a tag.
     *
     * The export runs outside the browser, so the module value the client sets when it
     * reads this document was never set here — and without it every tag would be grouped
     * under whatever the app ships rather than under what this account calls things. The
     * document is already in hand, so it costs nothing.
     */
    applyTagGroups(normalizeTagGroups(data.tags))
    const profile: UserProfile = {
      chesscomUsername: data.chesscomUsername ?? null,
      lichessUsername: data.lichessUsername ?? null,
      lastSyncAt: data.lastSyncAt ?? null,
    }

    const now = new Date()
    const games = gamesSnap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }) as GameRecord)
      .filter(game => matchesCriteria(game, criteria, now))
    // through the normaliser, like the client read: `keys` is derived there, and an
    // opening that arrives here as a bare cast matches nothing at all
    const openings = openingsSnap.docs.map(doc =>
      normalizeOpening({ ...doc.data(), id: doc.id } as OpeningLine),
    )

    return NextResponse.json({
      filters: criteria,
      ...buildExport(profile, games, openings, options),
    })
  } catch (error) {
    console.error('export failed', error)
    return deny(error instanceof Error ? error.message : 'Export failed.', 500)
  }
}
