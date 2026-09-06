import type { GameRecord } from '@/types/chess'

export interface StatBlock {
  total: number
  wins: number
  draws: number
  losses: number
  winPct: number
  drawPct: number
  lossPct: number
  /** Classic chess score: a win is 1, a draw is a half, expressed as a percentage. */
  score: number
}

export interface StatSplit {
  overall: StatBlock
  white: StatBlock
  black: StatBlock
}

const EMPTY: StatBlock = {
  total: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  winPct: 0,
  drawPct: 0,
  lossPct: 0,
  score: 0,
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10
}

export function computeStats(games: GameRecord[]): StatBlock {
  if (games.length === 0) return { ...EMPTY }

  let wins = 0
  let draws = 0
  let losses = 0

  for (const game of games) {
    if (game.result === 'win') wins++
    else if (game.result === 'draw') draws++
    else losses++
  }

  const total = games.length
  return {
    total,
    wins,
    draws,
    losses,
    winPct: pct(wins, total),
    drawPct: pct(draws, total),
    lossPct: pct(losses, total),
    score: pct(wins + draws / 2, total),
  }
}

export function computeSplit(games: GameRecord[]): StatSplit {
  return {
    overall: computeStats(games),
    white: computeStats(games.filter(g => g.color === 'white')),
    black: computeStats(games.filter(g => g.color === 'black')),
  }
}
