import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  GameRecord,
  NewPattern,
  PatternRecord,
  Source,
  SyncedGame,
  UserProfile,
} from '@/types/chess'

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400

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

export async function getProfile(userId: string): Promise<UserProfile> {
  const snapshot = await getDoc(doc(db, 'users', userId))
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

export async function getGames(userId: string): Promise<GameRecord[]> {
  const ref = collection(db, 'users', userId, 'games')
  const snapshot = await getDocs(query(ref, orderBy('playedAt', 'desc')))
  return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as GameRecord)
}

/** Ids of every stored game, used to skip games a previous sync already wrote. */
export async function getGameIds(userId: string): Promise<Set<string>> {
  const snapshot = await getDocs(collection(db, 'users', userId, 'games'))
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

/* --------------------------------------------------------------- patterns */

export async function getPatterns(userId: string): Promise<PatternRecord[]> {
  const ref = collection(db, 'users', userId, 'patterns')
  const snapshot = await getDocs(query(ref, orderBy('name')))
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
