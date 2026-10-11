/** How long does a material state actually last? The histogram decides the threshold. */
import { load } from '../../.claude/skills/game-analysis/scripts/slice'
import { materialByPly } from '@/lib/verdict'
import type { GameRecord } from '@/types/chess'

type Mat = ReturnType<typeof materialByPly> extends Map<number, infer M> ? M : never

const band = (p: number) =>
  p <= -3 ? 'piece-down' : p < 0 ? 'pawns-down' : p === 0 ? 'level' : p < 3 ? 'pawns-up' : 'piece-up'

const exchange = (m: Mat) => {
  const r = m.by.r ?? 0
  const minors = (m.by.b ?? 0) + (m.by.n ?? 0)
  return r === -1 && minors === 1 && (m.by.q ?? 0) === 0
}

const { games } = load()
const real: GameRecord[] = games.filter(g => !g.opponentIsBot && g.source !== 'upload' && g.moves.length > 0)

/** Every run of a state, as lengths in plies. */
function runs(game: GameRecord, keyOf: (m: Mat) => string | null): Map<string, number[]> {
  const material = materialByPly(game)
  const out = new Map<string, number[]>()
  let key: string | null = null
  let len = 0
  for (const ply of [...material.keys()].sort((a, b) => a - b)) {
    const next = keyOf(material.get(ply)!)
    if (next === key) { len++; continue }
    if (key !== null) out.set(key, [...(out.get(key) ?? []), len])
    key = next
    len = 1
  }
  if (key !== null) out.set(key, [...(out.get(key) ?? []), len])
  return out
}

const all = new Map<string, number[]>()
let neverLeftLevel4 = 0
let neverLeftLevel1 = 0

for (const game of real) {
  for (const [key, lengths] of runs(game, m => band(m.pawns))) {
    all.set(key, [...(all.get(key) ?? []), ...lengths])
  }
  for (const [, lengths] of runs(game, m => (exchange(m) ? 'exch' : null))) {
    all.set('exch', [...(all.get('exch') ?? []), ...lengths])
  }

  // a game where nothing was ever won: no non-level state lasted 4 plies / at all
  const byBand = runs(game, m => band(m.pawns))
  const offLevel = [...byBand].filter(([k]) => k !== 'level').flatMap(([, v]) => v)
  if (offLevel.every(len => len < 4)) neverLeftLevel4++
  if (offLevel.length === 0) neverLeftLevel1++
}

const BUCKETS = [[1, 1], [2, 3], [4, 5], [6, 9], [10, 19], [20, 999]] as const
console.log('RUN LENGTHS — how many plies a state lasted, as a share of all its runs\n')
console.log('  ' + 'state'.padEnd(12) + BUCKETS.map(([a, b]) => (a === b ? `${a}` : b === 999 ? `${a}+` : `${a}-${b}`).padStart(8)).join('') + '      runs')

for (const key of ['piece-down', 'pawns-down', 'level', 'pawns-up', 'piece-up', 'exch']) {
  const lengths = all.get(key) ?? []
  const row = BUCKETS.map(([lo, hi]) => {
    const n = lengths.filter(l => l >= lo && l <= hi).length
    return `${Math.round((n / lengths.length) * 100)}%`.padStart(8)
  })
  console.log('  ' + key.padEnd(12) + row.join('') + String(lengths.length).padStart(10))
}

console.log(`\n  median run, piece-up: ${median(all.get('piece-up')!)} plies · piece-down: ${median(all.get('piece-down')!)} · exchange: ${median(all.get('exch') ?? [0])}`)
console.log(`\n  games where nothing was ever won (no off-level state at all):      ${neverLeftLevel1} of ${real.length}`)
console.log(`  games where nothing was ever won (none lasting 4+ plies):         ${neverLeftLevel4} of ${real.length}`)

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]
}
