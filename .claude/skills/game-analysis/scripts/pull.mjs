/**
 * Refreshes the local snapshot of the stored games.
 *
 * Read-only. It copies documents the app has already written — the engine's analysis,
 * the second pass's verdicts, your reviews, the clocks — and computes nothing.
 *
 *   node .claude/skills/game-analysis/scripts/pull.mjs
 *
 * Writes .analysis-snapshot.json at the repo root (gitignored).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const OUT = '.analysis-snapshot.json'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0 && !line.trimStart().startsWith('#')) {
    env[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '')
  }
}

const uid = (env.ADMIN_IDS ?? '').split(',')[0].trim()
if (!uid) throw new Error('No ADMIN_IDS in .env.local — nothing to read.')

// an `authorized_user` credential defers to ADC, exactly as readCredential does in the app
initializeApp({ credential: applicationDefault(), projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })

const db = getFirestore()
const user = db.collection('users').doc(uid)

const [games, profile] = await Promise.all([user.collection('games').get(), user.get()])
const rows = games.docs.map(doc => ({ ...doc.data(), id: doc.id }))

writeFileSync(
  OUT,
  JSON.stringify({
    pulledAt: Date.now(),
    settings: profile.data()?.analysis ?? null,
    games: rows,
  }),
)

const analysed = rows.filter(game => game.analysis)
const judged = rows.filter(game => game.verdicts && Object.keys(game.verdicts).length > 0)
const verdicts = judged.reduce((n, game) => n + Object.keys(game.verdicts).length, 0)

console.log(`${rows.length} games -> ${OUT}`)
console.log(`  ${analysed.length} analysed by the engine (first pass)`)
console.log(`  ${judged.length} read by the second pass, ${verdicts} verdicts`)
