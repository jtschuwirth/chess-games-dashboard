import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
  type ServiceAccount,
} from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

const APP_NAME = 'export'

const SETUP_HINT =
  'No usable admin credential. Either put a service account JSON in ' +
  'FIREBASE_ADMIN_CREDENTIALS, or run `gcloud auth application-default login` so the SDK can ' +
  'pick up application default credentials. See the README.'

/**
 * Accepts whichever credential the project can actually issue:
 *
 * - a service account key (`"type": "service_account"`)
 * - application default credentials, which `gcloud auth application-default login`
 *   writes and which need no service account key — the way in when org policy
 *   forbids creating one
 *
 * Note the Firestore client refuses a `refreshToken()` credential built from user
 * JSON, so the `authorized_user` case defers to ADC rather than parsing it here.
 */
function readCredential(): Credential {
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS ?? process.env.FIREBASE_SERVICE_ACCOUNT_KEY

  if (raw) {
    let parsed: { type?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('FIREBASE_ADMIN_CREDENTIALS is not valid JSON.')
    }

    if (parsed.type === 'service_account') return cert(parsed as ServiceAccount)
    if (parsed.type !== 'authorized_user') {
      throw new Error(`Unsupported credential type "${parsed.type}".`)
    }
  }

  try {
    return applicationDefault()
  } catch {
    throw new Error(SETUP_HINT)
  }
}

/**
 * The admin app, shared by the routes that need to act without a signed-in session:
 * the export reads Firestore with it, the engine service verifies ID tokens with it.
 */
export function getAdminApp(): App {
  const existing = getApps().find(app => app.name === APP_NAME)
  if (existing) return existing

  return initializeApp(
    {
      credential: readCredential(),
      // ADC user credentials carry no project, so take it from the web config
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    },
    APP_NAME,
  )
}

/**
 * Server-side Firestore, used only by the export route. The client SDK cannot read
 * here: security rules tie every document to the signed-in user, and this runs with
 * no session.
 */
export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp())
}
