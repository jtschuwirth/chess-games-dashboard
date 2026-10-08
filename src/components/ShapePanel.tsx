'use client'

import { useMemo } from 'react'
import Panel from '@/components/Section'
import { isComparable } from '@/lib/accuracy'
import {
  ARCS,
  ARC_BADGE,
  ARC_LABEL,
  GAME_NAMES,
  TEXTURES,
  TEXTURE_LABEL,
  tellingOf,
  type Arc,
  type Texture,
} from '@/lib/shape'
import type { GameRecord } from '@/types/chess'

interface Cell {
  games: number
  won: number
  drawn: number
}

/**
 * What kind of games these were, which the result cannot say on its own.
 *
 * A win is a forty-move squeeze or a gift on move nine, and a loss is a game you were
 * never in or one you had won — the W/D/L split puts those together and this takes them
 * apart. Every figure comes off the stored evaluations, so the table is there the moment
 * the page is; what it cannot speak about is a game the engine has not seen, which is why
 * the heading counts the ones it is built from.
 */
export default function ShapePanel({ games }: { games: GameRecord[] }) {
  const read = useMemo(() => {
    const analysed = games.filter(game => game.analysis && isComparable(game))
    const grid = new Map<string, Cell>()
    let total = 0

    for (const game of analysed) {
      const telling = tellingOf(game)
      if (!telling) continue

      total++
      const key = `${telling.arc}|${telling.texture}`
      const cell = grid.get(key) ?? { games: 0, won: 0, drawn: 0 }
      cell.games++
      if (game.result === 'win') cell.won++
      if (game.result === 'draw') cell.drawn++
      grid.set(key, cell)
    }

    /** The biggest cell, which is what the bars below are drawn against. */
    const widest = Math.max(1, ...[...grid.values()].map(cell => cell.games))

    return { grid, total, widest, analysed: analysed.length, all: games.length }
  }, [games])

  if (read.total === 0) {
    return (
      <Panel id="shapes" title="How the games went">
        <p className="text-sm text-zinc-500">
          Nothing analysed in this slice yet. The shape of a game is read from the
          engine&apos;s evaluations, so it turns up once a game has been through the first
          pass.
        </p>
      </Panel>
    )
  }

  /* Rows with nothing in them are left out: two of the fifteen cannot happen at all. */
  const rows = ARCS.filter(arc =>
    TEXTURES.some(texture => (read.grid.get(`${arc}|${texture}`)?.games ?? 0) > 0),
  )

  const down = (texture: Texture) =>
    ARCS.reduce((sum, arc) => sum + (read.grid.get(`${arc}|${texture}`)?.games ?? 0), 0)
  const across = (arc: Arc) =>
    TEXTURES.reduce((sum, texture) => sum + (read.grid.get(`${arc}|${texture}`)?.games ?? 0), 0)

  const share = (count: number) => `${Math.round((count / read.total) * 100)}%`

  return (
    <Panel
      id="shapes"
      title="How the games went"
      meta={`${read.total} of ${read.all} analysed`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className={`${GRID} text-[10px] uppercase tracking-wide text-zinc-600`}>
            <span>What became of the lead</span>
            {TEXTURES.map(texture => (
              <span key={texture} className="text-right">
                {TEXTURE_LABEL[texture]}
              </span>
            ))}
            <span className="text-right text-zinc-500">all</span>
          </div>

          {rows.map(arc => (
            <div key={arc} className={GRID}>
              <span
                className={`justify-self-start text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${ARC_BADGE[arc]}`}
              >
                {ARC_LABEL[arc]}
              </span>
              {TEXTURES.map(texture => {
                const cell = read.grid.get(`${arc}|${texture}`)
                return (
                  <span
                    key={texture}
                    title={`${GAME_NAMES[arc][texture]}${
                      cell ? ` — ${cell.games} game${cell.games === 1 ? '' : 's'}, ${cell.won} won` : ''
                    }`}
                    className={`text-sm font-mono text-right tabular-nums cursor-help ${
                      cell ? 'text-zinc-300' : 'text-zinc-700'
                    }`}
                  >
                    {cell?.games ?? 0}
                  </span>
                )
              })}
              <span className="text-sm font-mono text-right tabular-nums text-zinc-500">
                {across(arc)}
              </span>
            </div>
          ))}

          <div className={`${GRID} border-t border-zinc-800 pt-1.5`}>
            <span className="text-[10px] uppercase tracking-wide text-zinc-600">all</span>
            {TEXTURES.map(texture => (
              <span key={texture} className="text-right">
                <span className="block text-sm font-mono text-zinc-300 tabular-nums">
                  {down(texture)}
                </span>
                <span className="block text-[10px] font-mono text-zinc-600 tabular-nums">
                  {share(down(texture))}
                </span>
              </span>
            ))}
            <span className="text-sm font-mono text-right tabular-nums text-zinc-500">
              {read.total}
            </span>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <h3 className="text-[10px] uppercase tracking-wide text-zinc-600 mb-2">
            What each one was
          </h3>
          <div className="columns-1 sm:columns-2 gap-x-8">
            {rows.flatMap(arc =>
              TEXTURES.map(texture => {
                const cell = read.grid.get(`${arc}|${texture}`)
                if (!cell) return null

                return (
                  <div
                    key={`${arc}|${texture}`}
                    title={`${ARC_LABEL[arc]}, ${TEXTURE_LABEL[texture]}`}
                    className="break-inside-avoid pb-2.5 cursor-help"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="flex-1 min-w-0 truncate text-xs text-zinc-300">
                        {GAME_NAMES[arc][texture]}
                      </span>
                      <span className="text-xs font-mono text-zinc-500 tabular-nums">
                        {cell.games}
                      </span>
                    </div>
                    {/* won / drawn / lost, so a name carries what it was worth */}
                    <span className="flex h-2 mt-1 rounded-full bg-zinc-800/80 overflow-hidden">
                      <span
                        className="h-full shrink-0 bg-emerald-500/50"
                        style={{ width: `${(cell.won / read.widest) * 100}%` }}
                      />
                      <span
                        className="h-full shrink-0 bg-zinc-500/40"
                        style={{ width: `${(cell.drawn / read.widest) * 100}%` }}
                      />
                      <span
                        className="h-full shrink-0 bg-red-500/40"
                        style={{
                          width: `${((cell.games - cell.won - cell.drawn) / read.widest) * 100}%`,
                        }}
                      />
                    </span>
                  </div>
                )
              }),
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}

/** One template for the header, the rows and the totals, so the columns cannot drift. */
const GRID =
  'grid grid-cols-[8rem_4.5rem_4.5rem_4.5rem_3.5rem] gap-x-2 items-center'
