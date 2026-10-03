import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  setDoc,
  addDoc,
  deleteDoc,
  deleteField,
  updateDoc,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Query, QuerySnapshot } from 'firebase/firestore'
import type {
  GameRecord,
  GameReview,
  StoredAnalysis,
  NewPattern,
  PatternRecord,
  Source,
  SyncedGame,
  UserProfile,
} from '@/types/chess'

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400

export interface ReadOptions {
  /** Skip the local cache and bill a server read. */
  fresh?: boolean
}

/**
 * Cache-first reads. Firestore bills one read per document returned, and the dashboard
 * needs the whole games collection, so a server read on every page view burns the daily
 * quota within a few dozen visits. Syncs write through the cache, so a stale cache only
 * means another device synced — `fresh` forces the server when that matters.
 */
async function readDocs(query: Query, options?: ReadOptions): Promise<QuerySnapshot> {
  if (!options?.fresh) {
    try {
      const cached = await getDocsFromCache(query)
      if (!cached.empty) return cached
    } catch {
      // no IndexedDB (private window, prerender) — fall through to the server
    }
  }

  return getDocs(query)
}

const EMPTY_PROFILE: UserProfile = {
  chesscomUsername: null,
  lichessUsername: null,
  lastSyncAt: null,
}

/** Deterministic doc id so a re-sync lands on the same document instead of duplicating. */
export function gameDocId(source: Source, sourceId: string): string {
  return `${source}_${sourceId}`
}

/* ---------------------------------------------------------------- profile */

export async function getProfile(userId: string, options?: ReadOptions): Promise<UserProfile> {
  const ref = doc(db, 'users', userId)
  let snapshot = null

  if (!options?.fresh) {
    try {
      snapshot = await getDocFromCache(ref)
    } catch {
      snapshot = null
    }
  }

  if (!snapshot || !snapshot.exists()) snapshot = await getDoc(ref)
  if (!snapshot.exists()) return { ...EMPTY_PROFILE }
  const data = snapshot.data()
  return {
    chesscomUsername: data.chesscomUsername ?? null,
    lichessUsername: data.lichessUsername ?? null,
    lastSyncAt: data.lastSyncAt ?? null,
  }
}

export async function saveProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
  await setDoc(doc(db, 'users', userId), profile, { merge: true })
}

/* ------------------------------------------------------------------ games */

export async function getGames(userId: string, options?: ReadOptions): Promise<GameRecord[]> {
  const ref = collection(db, 'users', userId, 'games')
  const snapshot = await readDocs(query(ref, orderBy('playedAt', 'desc')), options)
  return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as GameRecord)
}

/** Ids of every stored game, used to skip games a previous sync already wrote. */
export async function getGameIds(userId: string, options?: ReadOptions): Promise<Set<string>> {
  const snapshot = await readDocs(collection(db, 'users', userId, 'games'), options)
  return new Set(snapshot.docs.map(d => d.id))
}

export interface SaveGamesResult {
  added: GameRecord[]
  /** Games that were already stored and have been rewritten with fresh data. */
  updated: number
}

/**
 * Upserts every fetched game. Rewriting the ones already stored is what lets a re-sync
 * backfill fields added later — clock readings, for one — and `merge` leaves anything
 * not in the payload alone.
 */
export async function saveGames(userId: string, games: SyncedGame[]): Promise<SaveGamesResult> {
  const existing = await getGameIds(userId)
  const seen = new Set<string>()
  const records: GameRecord[] = []
  const added: GameRecord[] = []

  for (const game of games) {
    const id = gameDocId(game.source, game.sourceId)
    if (seen.has(id)) continue

    seen.add(id)
    const record: GameRecord = { ...game, id }
    records.push(record)
    if (!existing.has(id)) added.push(record)
  }

  for (let i = 0; i < records.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const game of records.slice(i, i + BATCH_LIMIT)) {
      const { id, ...rest } = game
      batch.set(
        doc(db, 'users', userId, 'games', id),
        { ...rest, syncedAt: serverTimestamp() },
        { merge: true },
      )
    }
    await batch.commit()
  }

  return { added, updated: records.length - added.length }
}

/**
 * Analysis is written per game as it completes, so a long run can be stopped and
 * picked up later without losing the work already done.
 */
export async function saveAnalysis(
  userId: string,
  gameId: string,
  analysis: StoredAnalysis,
  annotatedPgn: string,
): Promise<void> {
  await setDoc(
    doc(db, 'users', userId, 'games', gameId),
    { analysis, annotatedPgn },
    { merge: true },
  )
}

/**
 * Your own review of a game, written onto the game document. Keeping it there rather
 * than in a subcollection is what lets the dashboard filter and count reviews without
 * a single extra read: the games are already loaded.
 */
export async function saveReview(
  userId: string,
  gameId: string,
  draft: Omit<GameReview, 'reviewedAt'>,
): Promise<GameReview> {
  // stamped here rather than in the form: reading the clock during a render is not allowed
  const review: GameReview = { ...draft, reviewedAt: Date.now() }
  await setDoc(doc(db, 'users', userId, 'games', gameId), { review }, { merge: true })
  return review
}

export async function deleteReview(userId: string, gameId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'games', gameId), { review: deleteField() })
}

/* --------------------------------------------------------------- patterns */

export async function getPatterns(userId: string, options?: ReadOptions): Promise<PatternRecord[]> {
  const ref = collection(db, 'users', userId, 'patterns')
  const snapshot = await readDocs(query(ref, orderBy('name')), options)
  return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as PatternRecord)
}

export async function savePattern(userId: string, pattern: NewPattern): Promise<string> {
  const ref = collection(db, 'users', userId, 'patterns')
  const docRef = await addDoc(ref, { ...pattern, createdAt: serverTimestamp() })
  return docRef.id
}

export async function updatePattern(
  userId: string,
  patternId: string,
  pattern: NewPattern,
): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'patterns', patternId), { ...pattern })
}

export async function deletePattern(userId: string, patternId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'patterns', patternId))
}
