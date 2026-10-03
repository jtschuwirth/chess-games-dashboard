import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  CACHE_SIZE_UNLIMITED,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
)

/**
 * `getAuth` throws on an empty apiKey, which would break the build and every page
 * render before the user has an `.env.local`. The placeholder keeps the app loading
 * so `isFirebaseConfigured` can show a setup screen instead of a stack trace.
 */
const app =
  getApps().length === 0
    ? initializeApp({ ...firebaseConfig, apiKey: firebaseConfig.apiKey || 'not-configured' })
    : getApps()[0]

/**
 * Firestore with an IndexedDB cache, so the games collection survives a reload.
 * Reads are billed per document, and the dashboard needs every game, so without a
 * local copy each page view costs one read per stored game.
 *
 * Only in the browser: there is no IndexedDB during prerender. `initializeFirestore`
 * may only run once per app, so a hot reload falls back to the instance already made.
 */
function createDb(instance: FirebaseApp): Firestore {
  if (typeof window === 'undefined') return getFirestore(instance)

  try {
    return initializeFirestore(instance, {
      localCache: persistentLocalCache({
        // Unlimited disables the LRU collector outright. Evicting cached games is the
        // one thing this cache must never do — every eviction is a billed read later —
        // and the collection is a few hundred small documents. It also silences the
        // 'Collect garbage' lease errors: the scheduler is never started when the
        // threshold is -1, so a tab that is not primary has nothing to fail at.
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        tabManager: persistentMultipleTabManager(),
      }),
    })
  } catch {
    return getFirestore(instance)
  }
}

export const auth = getAuth(app)
export const db = createDb(app)
