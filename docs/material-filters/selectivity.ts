/** How selective is each imbalance, and how much of it is mid-exchange noise? */
import { load } from '../../.claude/skills/game-analysis/scripts/slice'
import { materialByPly } from '@/lib/verdict'
import type { GameRecord } from '@/types/chess'

type Mat = ReturnType<typeof materialByPly> extends Map<number, infer M> ? M : never

const band = (p: number) =>
  p <= -3 ? 'a piece down or worse' : p < 0 ? 'a pawn or two down' : p === 0 ? 'level'
  : p < 3 ? 'a pawn or two up' : 'a piece up or better'

/** The non-pawn trade, minors pooled: what you hold extra against what they do. */
function trade(m: Mat) {
  const up = { q: 0, r: 0, m: 0 }
  const down = { q: 0, r: 0, m: 0 }
  for (const t of ['q', 'r'] as const) {
    const d = m.by[t] ?? 0
    if (d > 0) up[t] = d
    else if (d < 0) down[t] = -d
  }
  const minors = (m.by.b ?? 0) + (m.by.n ?? 0)
  if (minors > 0) up.m = minors
  else if (minors < 0) down.m = -minors
  return { up, down, heavy: up.q + up.r + down.q + down.r > 0 }
}

function tokens(m: Mat): string[] {
  const out: string[] = []
  const { up, down, heavy } = trade(m)
  const only = (s: { q: number; r: number; m: number }, k: 'q' | 'r' | 'm', n: number) =>
    s[k] === n && Object.entries(s).every(([j, v]) => j === k || v === 0)

  if (only(down, 'r', 1) && only(up, 'm', 1)) out.push('gave the exchange')
  if (only(up, 'r', 1) && only(down, 'm', 1)) out.push('won the exchange')
  if (only(up, 'm', 2) && only(down, 'r', 1)) out.push('two minors for a rook')
  if (only(down, 'm', 2) && only(up, 'r', 1)) out.push('a rook for two minors')
  if (only(down, 'q', 1) && up.r + up.m >= 2) out.push('gave the queen for pieces')
  if (only(up, 'q', 1) && down.r + down.m >= 2) out.push('pieces for their queen')

  // minors level and no heavy trade: the bishop-against-knight question
  const minorsLevel = up.m === 0 && down.m === 0
  if (minorsLevel && !heavy) {
    const mine = m.mine.b ?? 0
    const theirs = m.theirs.b ?? 0
    if (mine >= 2 && theirs < 2) out.push('you had the bishop pair')
    else if (theirs >= 2 && mine < 2) out.push('they had the bishop pair')
    else if (mine !== theirs) out.push(mine > theirs ? 'a bishop for a knight' : 'a knight for a bishop')
  }

  // a minor given up for pawns, nothing back in pieces
  if (only(down, 'm', 1) && up.q + up.r + up.m === 0 && (m.by.p ?? 0) >= 2) out.push('a piece for pawns')
  if (only(up, 'm', 1) && down.q + down.r + down.m === 0 && (m.by.p ?? 0) <= -2) out.push('pawns for a piece')

  if (out.length > 0 || (up.q + up.r + up.m > 0 && down.q + down.r + down.m > 0)) out.push('any imbalance')
  return out
}

const { games } = load()
const real: GameRecord[] = games.filter(g => !g.opponentIsBot && g.source !== 'upload' && g.moves.length > 0)
console.log(`${real.length} real games\n`)

const RUNS = [1, 2, 4, 6, 8, 10]
const hits = new Map<string, number[]>()
const bandHits = new Map<string, number[]>()

for (const game of real) {
  const material = materialByPly(game)
  const plies = [...material.keys()].sort((a, b) => a - b)

  // longest consecutive run of each token, and of each band
  const tally = (keyOf: (m: Mat) => string[], into: Map<string, number[]>) => {
    const longest = new Map<string, number>()
    const current = new Map<string, number>()
    let prev: Set<string> = new Set()
    for (const ply of plies) {
      const keys = new Set(keyOf(material.get(ply)!))
      for (const k of keys) {
        const run = (prev.has(k) ? current.get(k)! : 0) + 1
        current.set(k, run)
        longest.set(k, Math.max(longest.get(k) ?? 0, run))
      }
      for (const k of prev) if (!keys.has(k)) current.set(k, 0)
      prev = keys
    }
    for (const [k, best] of longest) {
      const row = into.get(k) ?? RUNS.map(() => 0)
      RUNS.forEach((need, i) => { if (best >= need) row[i]++ })
      into.set(k, row)
    }
  }

  tally(tokens, hits)
  tally(m => [band(m.pawns)], bandHits)
}

const table = (title: string, data: Map<string, number[]>) => {
  console.log(title)
  console.log('  ' + 'held for at least'.padEnd(30) + RUNS.map(r => String(r).padStart(6)).join('') + '   plies')
  ;[...data].sort((a, b) => b[1][0] - a[1][0]).forEach(([k, row]) => {
    console.log('  ' + k.padEnd(30) + row.map(v => String(v).padStart(6)).join(''))
  })
  console.log()
}

table('GAMES MATCHING, BY HOW LONG THE STATE PERSISTED', hits)
table('BANDS', bandHits)
