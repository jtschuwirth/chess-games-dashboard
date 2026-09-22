#!/usr/bin/env node
/**
 * Flattens a Google admin credential JSON into .env.local as FIREBASE_ADMIN_CREDENTIALS.
 *
 *   node scripts/set-admin-credentials.mjs /path/to/credentials.json
 *
 * Works with a service account key or with the file written by
 * `gcloud auth application-default login`.
 */
import fs from 'node:fs'
import path from 'node:path'

const source = process.argv[2]
if (!source) {
  console.error('Usage: node scripts/set-admin-credentials.mjs <credentials.json>')
  process.exit(1)
}

let credential
try {
  credential = JSON.parse(fs.readFileSync(source, 'utf8'))
} catch (error) {
  console.error(`Could not read ${source}: ${error.message}`)
  process.exit(1)
}

if (credential.type !== 'service_account' && credential.type !== 'authorized_user') {
  console.error(`Unexpected credential type "${credential.type}".`)
  process.exit(1)
}

const envPath = path.join(process.cwd(), '.env.local')
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''

// one line, so the newline escapes inside the private key survive
const line = 'FIREBASE_ADMIN_CREDENTIALS=' + JSON.stringify(credential)

const kept = existing
  .split(/\r?\n/)
  .filter(entry => !entry.startsWith('FIREBASE_ADMIN_CREDENTIALS='))
  .join('\n')
  .replace(/\n+$/, '')

fs.writeFileSync(envPath, (kept ? kept + '\n' : '') + line + '\n', 'utf8')
console.log(`Wrote FIREBASE_ADMIN_CREDENTIALS (${credential.type}) to .env.local`)
