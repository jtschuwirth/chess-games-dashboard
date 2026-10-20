'use client'

import { useMemo, useState } from 'react'
import Panel from '@/components/Section'
import { heatBySquare, type MistakeRow } from '@/lib/mistakes'

/** The board's own colours, so the empty squares still read as a board. */
const LIGHT = '#eceed4'
const DARK = '#7b9a5e'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

/**
 * Where the mistakes land, drawn on a board.
 *
 * A board-shaped chart rather than the `Board` component: there are no pieces to place
 * and no moves to make, and teaching the real board about arbitrary square tinting would
 * complicate the thing five other screens depend on for the sake of one that is not
 * really a board at all.
 *
 * It is drawn **from your own side by default**, which is the only way the two halves of
 * your games can be read together: a weakness you keep creating in front of your own king
 * is on rank 2 as White and rank 7 as Black, and split across those it shows as nothing
 * on either. Only the rank is mirrored, so every file keeps its meaning. The raw view is
 * a press away, because a square can also matter in its own right.
 */
export default function MistakeHeatmap({ rows }: { rows: MistakeRow[] }) {
  const [yourSide, setYourSide] = useState(true)
  const heat = useMemo(() => heatBySquare(rows, yourSide), [rows, yourSide])

  const worst = useMemo(
    () => [...heat.values()].sort((a, b) => b.count - a.count).slice(0, 3),
    [heat],
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
      actions={
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setYourSide(true)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              yourSide
                ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
            title="Black's ranks mirrored onto White's, so both colours read together"
          >
            from my side
          </button>
          <button
            type="button"
            onClick={() => setYourSide(false)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              !yourSide
                ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
            title="The squares as they actually were"
          >
            as played
          </button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No marked moves in this slice — widen the filters, or analyse some games.
        </p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          <div className="w-full max-w-[24rem] mx-auto lg:mx-0">
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
            <p className="text-xs text-zinc-600 mt-2">
              {yourSide
                ? 'Your own side at the bottom, whichever colour you had.'
                : 'The squares exactly as they were on the board.'}
            </p>
          </div>

          <div className="min-w-0 flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Worst squares</span>
            {worst.map(entry => (
              <div key={entry.square} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-zinc-200 w-7">{entry.square}</span>
                <span className="h-2 rounded-full bg-red-500/70" style={{ width: `${entry.share * 7}rem` }} />
                <span className="text-zinc-500 text-xs tabular-nums">{entry.count}</span>
              </div>
            ))}
            <p className="text-xs text-zinc-600 max-w-[16rem] leading-relaxed">
              Shaded against the worst square rather than the total — sixty-four squares
              split as shares would all be slivers.
            </p>
          </div>
        </div>
      )}
    </Panel>
  )
}
