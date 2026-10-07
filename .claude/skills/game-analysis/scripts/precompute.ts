/**
 * Fills the second pass into Firestore, for games nobody has opened.
 *
 * This is the one script here that runs the engine, and it is not an analysis: it writes
 * what it computes back to the user's documents, so the dashboard, the game page and the
 * skill all see it afterwards. Reading the result is still a file read. Computing a number
 * for a report and throwing it away is the thing that is banned, not computing one for
 * everybody.
 *
 * It does exactly what the dashboard's "Read N more" does, with the same code, for people
 * who would rather leave it running than watch it:
 *
 *   node --experimental-strip-types --import ./.claude/skills/game-analysis/scripts/hook.mjs \
 *     .claude/skills/game-analysis/scripts/precompute.ts [--limit 50] [--control 180+2]
 *
 * Resumable. It skips every move that already has a verdict, so stopping it loses nothing
 * and running it again picks up where it left off.
 */
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { ENGINE_DEPTH, normalizeAnalysis } from '@/lib/analysis'
import { analyzeOnServer } from '@/lib/server-engine'
import { isFault } from '@/lib/review'
import { applySettings, normalizeSettings, settings } from '@/lib/settings'
import {
  countHolding,
  holdsFrom,
  materialEdge,
  readVerdict,
  reconcile,
  verdictsOf,
} from '@/lib/verdict'
import type { GameRecord, MoveVerdict } from '@/types/chess'

const args = process.argv.slice(2)
const option = (name: string) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}

const limit = Number(option('limit') ?? Infinity)
const control = option('control')

/** Generous: this is a desktop, not a serverless function with a platform ceiling. */
const SEARCH_LIMIT = 10 * 60_000

/* ------------------------------------------------------------------- firestore */

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0 && !line.trimStart().startsWith('#')) {
    env[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '')
  }
}

const uid = (env.ADMIN_IDS ?? '').split(',')[0].trim()
if (!uid) throw new Error('No ADMIN_IDS in .env.local.')

initializeApp({ credential: applicationDefault(), projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
const db = getFirestore()
const user = db.collection('users').doc(uid)

const profile = await user.get()
applySettings(normalizeSettings(profile.data()?.analysis))
const config = settings()

const snapshot = await user.collection('games').get()
const games = snapshot.docs
  .map(doc => ({ ...doc.data(), id: doc.id }) as GameRecord)
  .filter(game => game.analysis && !game.opponentIsBot && game.source !== 'upload')
  .filter(game => (control ? game.timeControl === control : true))
  .map(game => ({ ...game, analysis: normalizeAnalysis(game.analysis!, config) }))
  // newest first: the games worth reading soonest are the ones you just played
  .sort((a, b) => b.playedAt - a.playedAt)

/* --------------------------------------------------------------------- the work */

interface Job {
  game: GameRecord
  ply: number
  san: string
  cpBefore: number
  cpAfter: number
}

const jobs: Job[] = []
for (const game of games) {
  const stored = verdictsOf(game, config)
  for (const move of game.analysis?.moves ?? []) {
    if (!isFault(move.tag, config.marks)) continue
    if (stored[String(move.ply)]) continue
    jobs.push({
      game,
      ply: move.ply,
      san: move.san,
      cpBefore: move.cpBefore,
      cpAfter: move.cpAfter,
    })
  }
}

const todo = jobs.slice(0, Number.isFinite(limit) ? limit : undefined)
console.log(`${games.length} games, ${jobs.length} marked moves unread, taking ${todo.length}`)
console.log(`about ${Math.round((todo.length * 6) / 60)} minutes\n`)

/** Verdicts build up per game so one write covers a whole game. */
const pending = new Map<string, Record<string, MoveVerdict>>()
const skipped: string[] = []
let done = 0

async function flush(gameId: string) {
  const judged = pending.get(gameId)
  if (!judged || Object.keys(judged).length === 0) return

  await user.collection('games').doc(gameId).set({ verdicts: judged }, { merge: true })
  pending.delete(gameId)
}

for (const [index, job] of todo.entries()) {
  const chess = new Chess()
  let reached = true
  for (let ply = 0; ply < job.ply; ply++) {
    try {
      chess.move(job.game.moves[ply])
    } catch {
      reached = false
      break
    }
  }
  if (!reached) continue

  const fen = chess.fen()

  /*
    A cleared hash and five lines on a dense middlegame can take minutes, and one slow
    position must not end a run of hundreds. The move is skipped and reported; a later
    run tries it again, because nothing was written for it.
  */
  let search
  try {
    search = await analyzeOnServer(fen, ENGINE_DEPTH, config.lines, SEARCH_LIMIT)
  } catch (error) {
    skipped.push(`${job.game.id} ply ${job.ply}: ${(error as Error).message}`)
    continue
  }

  const edge = materialEdge(fen, job.game.color)

  // named first: `reconcile` finds the move that was played by its SAN
  const named = search.moves.map(candidate => {
    const board = new Chess(fen)
    let san = candidate.uci
    try {
      san = board.move({
        from: candidate.uci.slice(0, 2),
        to: candidate.uci.slice(2, 4),
        promotion: candidate.uci.slice(4, 5) || undefined,
      }).san
    } catch {
      // an unreadable move keeps its coordinates rather than dropping the line
    }
    return { san, cp: candidate.cp }
  })

  const read = reconcile(job, named, job.game.analysis?.depth ?? 0, search.depth)
  const holds = countHolding(read.reference, read.scores, config)
  const scored = named.map((candidate, rank) => ({
    ...candidate,
    holds: holdsFrom(read.reference, read.scores[rank], config),
  }))

  const verdicts = pending.get(job.game.id) ?? {}
  verdicts[String(job.ply)] = {
    ply: job.ply,
    material: edge.pawns,
    materialBy: edge.by,
    pieces: { mine: edge.mine, theirs: edge.theirs },
    candidates: scored,
    // the search's own top line, kept as the measurement it is — see judgeGame
    best: search.moves[0].cp,
    holds,
    looked: read.scores.length,
    verdict: readVerdict(
      { cpBefore: job.cpBefore, cpAfter: job.cpAfter, holds, looked: read.scores.length },
      config,
    ),
    depth: search.depth,
    judgedAt: Date.now(),
  }
  pending.set(job.game.id, verdicts)

  // written out as soon as the game's last marked move is done
  const next = todo[index + 1]
  if (!next || next.game.id !== job.game.id) await flush(job.game.id)

  done++
  if (done % 10 === 0 || !next) {
    console.log(`  ${done}/${todo.length}`)
  }
}

for (const gameId of [...pending.keys()]) await flush(gameId)
console.log('')
console.log(`wrote ${done} verdicts`)
if (skipped.length > 0) {
  console.log(`${skipped.length} skipped, to be retried by a later run:`)
  for (const line of skipped) console.log(`  ${line}`)
}
