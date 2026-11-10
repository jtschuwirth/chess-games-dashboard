/**
 * A sheet of games for the dev account, built rather than copied.
 *
 * Every move is played through chess.js, so the file cannot contain an illegal one —
 * which is the whole reason for generating rather than typing a famous game from memory.
 * The openings are real and written out; what follows is chosen by a crude heuristic that
 * likes captures and checks, which is what makes these worth analysing: they are full of
 * the kind of mistake the engine is there to find.
 */
import { Chess } from 'chess.js'
import { writeFileSync } from 'node:fs'

/* A seeded generator, so re-running this produces the same games and re-uploading them
   lands on the same document ids rather than filling the account with near-duplicates. */
let seed = 20261110
function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

const OPENINGS = [
  { eco: 'B10', name: 'Caro-Kann Defense', moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'C50', name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3'] },
  { eco: 'D37', name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7', 'Bf4'] },
  { eco: 'D02', name: 'London System', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'c5', 'c3'] },
  { eco: 'B50', name: 'Sicilian Defense', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'] },
  { eco: 'C00', name: 'French Defense', moves: ['e4', 'e6', 'd4', 'd5', 'Nd2', 'Nf6', 'e5', 'Nfd7', 'Bd3'] },
]

const CONTROLS = ['180+2', '300+0', '600+0', '900+10']
const OPPONENTS = [
  'rook_rattler', 'pawnstorm91', 'knightcap', 'zugzwangzi', 'blunderbuss',
  'tempo_thief', 'fianchetto_fan', 'quietmove', 'endgame_eddie', 'openingbook',
]

/** Likes a capture, then a check, then anything — a plausible club player in a hurry. */
function pickMove(chess) {
  const legal = chess.moves({ verbose: true })
  if (legal.length === 0) return null

  const captures = legal.filter(move => move.captured)
  const checks = legal.filter(move => move.san.includes('+') || move.san.includes('#'))
  const roll = random()

  const pool =
    roll < 0.38 && captures.length > 0 ? captures
    : roll < 0.52 && checks.length > 0 ? checks
    : legal

  return pool[Math.floor(random() * pool.length)]
}

/** A clock that ticks down plausibly, so the clock panel has something real to read. */
function clockFor(left, control) {
  const [, increment] = control.split('+').map(Number)
  const spent = Math.min(left - 1, Math.max(1, Math.round(random() * 22)))
  const next = Math.max(1, left - spent + increment)
  const h = Math.floor(next / 3600)
  const m = Math.floor((next % 3600) / 60)
  const s = next % 60
  return { left: next, text: `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }
}

function buildGame(index) {
  const opening = OPENINGS[index % OPENINGS.length]
  const control = CONTROLS[index % CONTROLS.length]
  const mineIsWhite = index % 2 === 0
  const chess = new Chess()

  for (const san of opening.moves) chess.move(san)

  const limit = 40 + Math.floor(random() * 40)
  while (!chess.isGameOver() && chess.history().length < limit) {
    const move = pickMove(chess)
    if (!move) break
    chess.move(move.san)
  }

  const history = chess.history()
  const result = chess.isCheckmate()
    ? (chess.turn() === 'w' ? '0-1' : '1-0')
    : chess.isGameOver()
      ? '1/2-1/2'
      // a game stopped at the move limit is adjudicated, weighted decisive: a sheet that
      // is more than half draws says very little about a win/draw/loss split
      : random() < 0.42 ? '1-0' : random() < 0.72 ? '0-1' : '1/2-1/2'

  const termination = chess.isCheckmate()
    ? 'Normal'
    : chess.isStalemate() ? 'Stalemate'
    : chess.isInsufficientMaterial() ? 'Insufficient material'
    : chess.isDraw() ? 'Normal'
    : random() < 0.3 ? 'Time forfeit' : 'Normal'

  // spread across eight months, oldest first, so the date windows have something to cut
  const day = new Date(Date.UTC(2026, 2, 7 + index * 11, 19, 12, 0))
  const pad = n => String(n).padStart(2, '0')
  const date = `${day.getUTCFullYear()}.${pad(day.getUTCMonth() + 1)}.${pad(day.getUTCDate())}`

  const me = 'devschuwirth'
  const them = OPPONENTS[index % OPPONENTS.length]
  const white = mineIsWhite ? me : them
  const black = mineIsWhite ? them : me

  const myElo = 1480 + index * 9 + Math.floor(random() * 30)
  const theirElo = myElo - 40 + Math.floor(random() * 80)

  // every other game carries move times, so both the "has clocks" and the "has none"
  // paths are in the data rather than only one of them
  const withClocks = index % 2 === 0
  const base = Number(control.split('+')[0])
  let clocks = [base, base]

  const body = []
  history.forEach((san, ply) => {
    const number = Math.floor(ply / 2) + 1
    const prefix = ply % 2 === 0 ? `${number}. ` : ''
    if (!withClocks) {
      body.push(prefix + san)
      return
    }
    const side = ply % 2
    const tick = clockFor(clocks[side], control)
    clocks[side] = tick.left
    body.push(`${prefix}${san} {[%clk ${tick.text}]}`)
  })

  const headers = [
    ['Event', 'Dev account check'],
    ['Site', 'localhost'],
    ['Date', date],
    ['Round', '-'],
    ['White', white],
    ['Black', black],
    ['Result', result],
    ['WhiteElo', String(mineIsWhite ? myElo : theirElo)],
    ['BlackElo', String(mineIsWhite ? theirElo : myElo)],
    ['ECO', opening.eco],
    ['Opening', opening.name],
    ['TimeControl', control],
    ['Termination', termination],
  ]

  return (
    headers.map(([key, value]) => `[${key} "${value}"]`).join('\n') +
    '\n\n' +
    body.join(' ') +
    ` ${result}\n`
  )
}

const count = Number(process.argv[2] ?? 12)
const pgn = Array.from({ length: count }, (unused, index) => buildGame(index)).join('\n')

writeFileSync(process.argv[3] ?? 'dev-games.pgn', pgn, 'utf8')
console.log(`${count} games, ${pgn.length} characters`)
