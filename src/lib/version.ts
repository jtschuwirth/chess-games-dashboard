/**
 * What is deployed, short enough to read at a glance.
 *
 * Vercel exposes the commit it built from as a system environment variable, and the
 * `NEXT_PUBLIC_` ones are inlined into the browser bundle at build time — so this is a
 * literal in the shipped JavaScript, not a lookup, and it cannot drift from the code
 * around it. Locally there is no commit to name, so it says so rather than pretending.
 */
const SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA

/** `production`, `preview`, or `local` when this is not a deployment at all. */
export const DEPLOY_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'local'

/** The seven characters of the commit git itself shows, or `dev`. */
export const COMMIT = SHA ? SHA.slice(0, 7) : 'dev'

/** "production · df3cda7", for a corner of the screen. */
export const VERSION = `${DEPLOY_ENV} · ${COMMIT}`
