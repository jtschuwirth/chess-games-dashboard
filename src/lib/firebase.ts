import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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

export const auth = getAuth(app)
export const db = getFirestore(app)
