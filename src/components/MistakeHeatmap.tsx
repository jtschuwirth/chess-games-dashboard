'use client'

import { useMemo } from 'react'
import Panel from '@/components/Section'
import { heatBySquare, heatmapOf, type MistakeRow } from '@/lib/mistakes'

/** The board's own colours, so the empty squares still read as a board. */
const LIGHT = '#eceed4'
const DARK = '#7b9a5e'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

/** How many squares the ranking lists. Eight fills the board's own height. */
const RANKED = 8

/**
 * Where the mistakes land, drawn on a board.
 *
 * A board-shaped chart rather than the `Board` component: there are no pieces to place
 * and no moves to make, and teaching the real board about arbitrary square tinting would
 * complicate the thing five other screens depend on for the sake of one that is not
 * really a board at all.
 *
 * **The squares are the squares.** A `from my side` view mirrored a Black game's ranks
 * onto White's for a while, so that both colours could be read together — and it printed
 * relative data under absolute labels, which meant the square marked `e5` was holding
 * White's e5 mistakes and Black's e4 ones. Narrowing to one colour with the Colour chips
 * answers the same question without renaming any square.
 *
 * Nothing here is explained in a sentence: the counts are on the squares, the ranking is
 * beside them, and the shading runs from the worst square, which the full bar at the top
 * of that ranking says on its own.
 */
export default function MistakeHeatmap({ rows }: { rows: MistakeRow[] }) {
  const heat = useMemo(() => heatBySquare(rows), [rows])

  const ranked = useMemo(
    () =>
      heatmapOf(rows)
        .sort((a, b) => b.count - a.count || a.square.localeCompare(b.square))
        .slice(0, RANKED),
    [rows],
  )

  return (
    <Panel
      id="mistake-heatmap"
      title="Where they land"
      meta={
        rows.length === 0
          ? 'nothing in this slice'
          : `${rows.length} ${rows.length === 1 ? 'move' : 'moves'} on ${heat.size} squares`
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No marked moves in this slice — widen the filters, or analyse some games.
        </p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="w-full max-w-[24rem] mx-auto lg:mx-0 shrink-0">
            <div className="relative w-full aspect-square rounded-md overflow-hidden ring-1 ring-black/50">
              <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
                {/* rank 8 at the top, the way a diagram is drawn */}
                {Array.from({ length: 8 }, (_, row) => 8 - row).flatMap(rank =>
                  FILES.map(file => {
                    const square = `${file}${rank}`
                    const entry = heat.get(square)
                    const light = (FILES.indexOf(file) + rank) % 2 === 1

                    return (
                      <div
                        key={square}
                        className="relative"
                        style={{ background: light ? LIGHT : DARK }}
                        title={
                          entry
                            ? `${square} — ${entry.count} ${entry.count === 1 ? 'mistake' : 'mistakes'}`
                            : `${square} — none`
                        }
                      >
                        {/*
                          One wash over the board's own colour rather than replacing it.
                          A square with nothing on it has to still look like part of a
                          board, or the chart stops being readable as one.
                        */}
                        {entry && entry.count > 0 && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-0"
                            style={{ background: '#e04b43', opacity: 0.12 + entry.share * 0.78 }}
                          />
                        )}
                        {entry && entry.count > 0 && (
                          <span
                            className="absolute inset-0 flex items-center justify-center text-[0.7rem] font-semibold tabular-nums"
                            style={{ color: entry.share > 0.45 ? '#ffffff' : '#1c1917' }}
                          >
                            {entry.count}
                          </span>
                        )}
                        {rank === 1 && (
                          <span className="absolute bottom-px right-1 text-[0.55rem] font-semibold text-black/45">
                            {file}
                          </span>
                        )}
                        {file === 'a' && (
                          <span className="absolute top-px left-1 text-[0.55rem] font-semibold text-black/45">
                            {rank}
                          </span>
                        )}
                      </div>
                    )
                  }),
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 w-full lg:max-w-xs flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Worst squares</span>

            <div className="flex flex-col gap-1.5">
              {ranked.map(entry => (
                <div
                  key={entry.square}
                  className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.5rem_2.75rem] items-center gap-2 text-sm"
                  title={`${entry.count} of ${rows.length} marked moves landed on ${entry.square}`}
                >
                  <span className="font-mono text-zinc-200">{entry.square}</span>
                  <span className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-red-500/70"
                      style={{ width: `${entry.share * 100}%` }}
                    />
                  </span>
                  <span className="text-xs text-right text-zinc-300 tabular-nums">
                    {entry.count}
                  </span>
                  <span className="text-xs text-right text-zinc-600 tabular-nums">
                    {((entry.count / rows.length) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
