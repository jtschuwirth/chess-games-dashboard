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
import { normalizeAnalysis } from './analysis'
import { normalizeOpening } from './opening'
import { normalizePattern } from './pattern'
import { studyBody, studyHasContent } from './study'
import {
  normalizeSettings,
  applySettings,
  type AnalysisSettings,
} from './settings'
import { normalizePlan } from './plan'
import {
  closingRatings,
  joinYears,
  mergeHistory,
  splitByYear,
  type RatingHistory,
} from './rating-history'
import type { Query, QuerySnapshot } from 'firebase/firestore'
import type {
  DrillStat,
  GameRecord,
  MoveVerdict,
  GameReview,
  StoredAnalysis,
  NewOpeningLine,
  NewPattern,
  NewStudyPlan,
  OpeningLine,
  OpeningStudy,
  PatternRecord,
  StudyPlan,
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

/** The raw user document, cache-first. The profile and the settings both live in it. */
async function getProfileDoc(
  userId: string,
  options?: ReadOptions,
): Promise<Record<string, unknown> | null> {
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
  return snapshot.exists() ? snapshot.data() : null
}

export async function getProfile(userId: string, options?: ReadOptions): Promise<UserProfile> {
  const data = (await getProfileDoc(userId, options)) as Partial<UserProfile> | null
  if (!data) return { ...EMPTY_PROFILE }
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

/**
 * The account's analysis settings, cached for the session.
 *
 * Read before the games are, because the marks are re-derived as they are read and a
 * mark derived from the defaults and then shown under your own bands would be two
 * answers to one question. One extra document read, once.
 */
const settingsCache = new Map<string, Promise<AnalysisSettings>>()

export function getSettings(userId: string): Promise<AnalysisSettings> {
  const cached = settingsCache.get(userId)
  if (cached) return cached

  const loading = getProfileDoc(userId)
    .then(data => normalizeSettings((data as { analysis?: Partial<AnalysisSettings> })?.analysis))
    .catch(() => normalizeSettings(undefined))
    .then(loaded => {
      applySettings(loaded)
      return loaded
    })

  settingsCache.set(userId, loading)
  return loading
}

export async function saveSettings(
  userId: string,
  analysis: AnalysisSettings,
): Promise<AnalysisSettings> {
  const next = normalizeSettings(analysis)
  await setDoc(doc(db, 'users', userId), { analysis: next }, { merge: true })

  applySettings(next)
  settingsCache.set(userId, Promise.resolve(next))
  return next
}

export async function getGames(userId: string, options?: ReadOptions): Promise<GameRecord[]> {
  const thresholds = await getSettings(userId)
  const ref = collection(db, 'users', userId, 'games')
  const snapshot = await readDocs(query(ref, orderBy('playedAt', 'desc')), options)

  // the one place a stored game becomes the shape the rest of the code expects: the
  // marks are re-derived here, so moving a threshold never means re-analysing anything
  return snapshot.docs.map(d => {
    const game = { ...d.data(), id: d.id } as GameRecord
    return game.analysis
      ? { ...game, analysis: normalizeAnalysis(game.analysis, thresholds) }
      : game
  })
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

  /*
    The rating history is kept current here rather than by each caller, so no write path
    can forget it. It is rebuilt from every stored game rather than from this batch
    alone: the batch's last game of a day is not necessarily the day's last game, and
    merging a stale close over a real one would quietly corrupt the series. Reading the
    games back is cache-first and the writes above went through that cache.
  */
  try {
    const all = await getGames(userId)
    const stored = await getRatingHistory(userId)
    await saveRatingHistory(userId, mergeHistory(stored, closingRatings(all)))
  } catch {
    // a sync that stored its games has done its job; the history catches up next time
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

/**
 * The variations you have played out on a game, as PGN.
 *
 * Its own write rather than part of the review: you can analyse a game without
 * writing a post-mortem, and the two should not be able to clear each other. A tree
 * holding nothing but the game itself is deleted rather than stored, so a game
 * nobody has branched reads as exactly that.
 */
export async function saveVariations(
  userId: string,
  gameId: string,
  pgn: string,
  hasBranches = true,
): Promise<void> {
  await setDoc(
    doc(db, 'users', userId, 'games', gameId),
    { variationsPgn: hasBranches ? pgn : deleteField() },
    { merge: true },
  )
}

export async function deleteReview(userId: string, gameId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'games', gameId), { review: deleteField() })
}

/**
 * One attempt at a drilled position, keyed by ply under the game.
 *
 * `merge` on a map field merges keys rather than replacing the map, so two positions
 * from the same game never overwrite each other's record.
 */
export async function saveDrillResult(
  userId: string,
  gameId: string,
  ply: number,
  stat: DrillStat,
): Promise<void> {
  await setDoc(
    doc(db, 'users', userId, 'games', gameId),
    { drills: { [String(ply)]: stat } },
    { merge: true },
  )
}

/**
 * The second pass's reading of the marked moves, merged in by ply.
 *
 * `merge` on a map field merges keys, so judging two more moves never clears the ones
 * already judged — the same reason the drill records are stored this way.
 */
export async function saveVerdicts(
  userId: string,
  gameId: string,
  verdicts: Record<string, MoveVerdict>,
): Promise<void> {
  if (Object.keys(verdicts).length === 0) return

  await setDoc(doc(db, 'users', userId, 'games', gameId), { verdicts }, { merge: true })
}

/**
 * Throwing out a reading you disagree with.
 *
 * Flagged rather than deleted: running the pass again must not hand you back something
 * you have already rejected, and the only way it can know is if the rejection is stored.
 */
export async function dismissVerdict(
  userId: string,
  gameId: string,
  ply: number,
  dismissed: boolean,
): Promise<void> {
  await setDoc(
    doc(db, 'users', userId, 'games', gameId),
    { verdicts: { [String(ply)]: { dismissed } } },
    { merge: true },
  )
}

/* --------------------------------------------------------------- openings */

/**
 * Saved opening lines. They live under the `patterns` collection id because that is
 * what they were called when they were written, and moving a user's documents to free
 * the word for the thematic patterns would be a migration with real downside and no
 * visible gain. The code says opening; only the id remembers.
 */

export async function getOpenings(userId: string, options?: ReadOptions): Promise<OpeningLine[]> {
  const ref = collection(db, 'users', userId, 'patterns')
  const snapshot = await readDocs(query(ref, orderBy('name')), options)
  // the one place a stored line becomes the shape the rest of the code expects
  return snapshot.docs.map(d => normalizeOpening({ ...d.data(), id: d.id } as OpeningLine))
}

export async function saveOpening(userId: string, opening: NewOpeningLine): Promise<string> {
  const ref = collection(db, 'users', userId, 'patterns')
  const docRef = await addDoc(ref, { ...opening, createdAt: serverTimestamp() })
  return docRef.id
}

export async function updateOpening(
  userId: string,
  openingId: string,
  opening: NewOpeningLine,
): Promise<void> {
  /*
    An update merges, and the form sends only the line itself — name, PGN, moves, colour.
    So editing a line leaves whatever study is written on it exactly where it was, which
    is the behaviour we want and the one worth saying out loud, because the alternative
    is a page that silently eats everything you wrote the first time you fix a typo.
  */
  await updateDoc(doc(db, 'users', userId, 'patterns', openingId), {
    ...opening,
    updatedAt: Date.now(),
  })
}

/**
 * The study alone, without the line it sits on.
 *
 * Narrower than `updateOpening` on purpose: writing what you know about an opening must
 * not be able to touch its `moves` or its `positionKey`, because those are what every
 * game is matched against and they were computed once, at save time, in the browser.
 *
 * A study with nothing in it is deleted rather than stored as an empty map, so a line
 * nobody has written up reads as exactly that.
 */
export async function saveStudy(
  userId: string,
  openingId: string,
  study: OpeningStudy,
): Promise<number> {
  const body = studyBody(study)
  const updatedAt = Date.now()

  await updateDoc(doc(db, 'users', userId, 'patterns', openingId), {
    study: studyHasContent(body) ? body : deleteField(),
    updatedAt,
  })

  return updatedAt
}

export async function deleteOpening(userId: string, openingId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'patterns', openingId))
}

/* --------------------------------------------------------- thematic patterns */

/**
 * The written-up patterns. `patterns` as a collection id belongs to the saved opening
 * lines, which held it first, so these live under `thematicPatterns` — the name a
 * reader is least likely to confuse with the other one.
 */
const PATTERNS = 'thematicPatterns'

/**
 * The written-up patterns, from the server by default — the plans argument, and for
 * the same two reasons. There are a handful of them, not a thousand, so a fresh read
 * costs almost nothing; and they are written on one device and read on another, which
 * is exactly where a cache-first read shows you what *this* device last saw.
 *
 * It bit in practice: a browser whose cache held one of four patterns showed one
 * pattern, and the one it showed was a version from before its comments were written.
 * `readDocs` trusts any cache that is not empty, so a partial one is indistinguishable
 * from a complete one.
 */
export async function getPatterns(
  userId: string,
  options?: ReadOptions,
): Promise<PatternRecord[]> {
  const ref = collection(db, 'users', userId, PATTERNS)
  const snapshot = await readDocs(query(ref, orderBy('name')), { fresh: true, ...options })
  // the one place a stored pattern becomes the shape the rest of the code expects
  return snapshot.docs.map(d => normalizePattern({ ...d.data(), id: d.id } as PatternRecord))
}

export async function savePattern(userId: string, pattern: NewPattern): Promise<string> {
  const ref = collection(db, 'users', userId, PATTERNS)
  const docRef = await addDoc(ref, pattern)
  return docRef.id
}

export async function updatePattern(
  userId: string,
  patternId: string,
  pattern: NewPattern,
): Promise<void> {
  /*
    `main` is deleted rather than left alone. An update merges, so a field nobody writes
    any more simply stays in the document — and `normalizePattern` would keep putting it
    back at the front of the examples, so the line you just reordered or removed would
    reappear on the next read.
  */
  await updateDoc(doc(db, 'users', userId, PATTERNS, patternId), {
    ...pattern,
    main: deleteField(),
  })
}

export async function deletePattern(userId: string, patternId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, PATTERNS, patternId))
}

/* ------------------------------------------------------------------ study plans */

const PLANS = 'studyPlans'

/**
 * Plans come from the server, not the cache, and they are the one collection that does.
 *
 * Everything else here is cache-first because Firestore bills per document and the games
 * collection is a thousand of them. A plan is the opposite on both counts: there are one
 * or two, and it is the thing you tick off on a phone during the day and open on a laptop
 * in the evening. Cache-first meant the laptop showed what the laptop last saw — four
 * blitz games ticked off on the phone, and an empty day on the desktop — because a write
 * from another device never reaches this one's cache. Two billed reads a visit is the
 * right price for a page that is wrong without them.
 */
export async function getPlans(userId: string, options?: ReadOptions): Promise<StudyPlan[]> {
  const ref = collection(db, 'users', userId, PLANS)
  const snapshot = await readDocs(query(ref, orderBy('startDate', 'desc')), {
    fresh: true,
    ...options,
  })
  // the one place a stored plan becomes the shape the rest of the code expects
  return snapshot.docs.map(d => normalizePlan({ ...d.data(), id: d.id } as StudyPlan))
}

export async function savePlan(userId: string, plan: NewStudyPlan): Promise<string> {
  const ref = collection(db, 'users', userId, PLANS)
  const docRef = await addDoc(ref, { ...plan, updatedAt: Date.now() })
  return docRef.id
}

/**
 * The whole plan goes back on every change — a checkbox, a note, a task added.
 * A plan is a few hundred bytes and a write is a write whatever its size, so rewriting
 * it costs the same as patching one field and removes every question about two edits
 * racing on the same document.
 */
export async function updatePlan(
  userId: string,
  planId: string,
  plan: NewStudyPlan,
): Promise<void> {
  // stamped here rather than by the caller: a timestamp nobody can forget to set, and
  // one that never travels in `planBody`, where it would be compared and written back
  await setDoc(doc(db, 'users', userId, PLANS, planId), { ...plan, updatedAt: Date.now() })
}

export async function deletePlan(userId: string, planId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, PLANS, planId))
}

/* ----------------------------------------------------------- rating history */

/**
 * Daily closing ratings, one document per year.
 *
 * A document per day would be a read per day on the dashboard, which is the cost model
 * this app is built around avoiding; a single document for all time would eventually
 * meet Firestore's 1MB ceiling. A year is a few thousand small entries and one read.
 */
const RATINGS = 'ratingHistory'

export async function getRatingHistory(
  userId: string,
  options?: ReadOptions,
): Promise<RatingHistory> {
  const ref = collection(db, 'users', userId, RATINGS)
  const snapshot = await readDocs(query(ref), options)

  return joinYears(
    snapshot.docs.map(d => ({ year: d.id, days: (d.data().days ?? {}) as RatingHistory })),
  )
}

/** Writes only the years that changed, which after a sync is usually one. */
export async function saveRatingHistory(userId: string, history: RatingHistory): Promise<void> {
  const years = splitByYear(history)
  if (years.length === 0) return

  const batch = writeBatch(db)
  for (const year of years) {
    batch.set(doc(db, 'users', userId, RATINGS, year.year), { days: year.days }, { merge: true })
  }
  await batch.commit()
}
