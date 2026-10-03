'use client'

import { useEffect, useRef } from 'react'
import type { Ply } from '@/lib/board'

/** Engine marks, coloured by how much they cost. */
const TAG_COLOR: Record<string, string> = {
  '??': 'text-red-400',
  '?': 'text-amber-400',
  '?!': 'text-yellow-600',
  '!!': 'text-emerald-400',
}

/**
 * The game's moves, two per row. Clicking one puts the board in that position;
 * engine marks sit on your own moves, and a dot marks the ones you have reviewed.
 */
export default function MoveList({
  plies,
  current,
  onPick,
  tags,
  reviewed,
  secondsByPly,
}: {
  plies: Ply[]
  /** Ply index on the board, or -1 for the starting position. */
  current: number
  onPick: (index: number) => void
  /** Engine mark per ply, for your moves only. */
  tags: Map<number, string>
  /** Plies that appear in your review. */
  reviewed: Set<number>
  /** Seconds you spent, per ply, where the game carries clock readings. */
  secondsByPly: Map<number, number>
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null)

  /** Stepping with the arrow keys should not leave the move off screen. */
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const rows = Math.ceil(plies.length / 2)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto text-sm font-mono">
      {Array.from({ length: rows }, (_, row) => {
        const white = plies[row * 2]
        const black = plies[row * 2 + 1]

        return (
          <div key={row} className="grid grid-cols-[2.25rem_1fr_1fr] border-b border-zinc-800/60">
            <span className="px-2 py-1 text-xs text-zinc-600 tabular-nums">{row + 1}.</span>
            {[white, black].map((ply, column) =>
              ply ? (
                <button
                  key={column}
                  ref={ply.index === current ? activeRef : undefined}
                  onClick={() => onPick(ply.index)}
                  title={
                    secondsByPly.has(ply.index) ? `${secondsByPly.get(ply.index)}s spent` : undefined
                  }
                  className={`px-2 py-1 text-left transition-colors ${
                    ply.index === current
                      ? 'bg-zinc-700 text-zinc-50'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {ply.san}
                  {tags.has(ply.index) && (
                    <span className={TAG_COLOR[tags.get(ply.index) as string] ?? 'text-zinc-500'}>
                      {tags.get(ply.index)}
                    </span>
                  )}
                  {reviewed.has(ply.index) && (
                    <span className="text-sky-400 ml-1" title="In your review">
                      ◆
                    </span>
                  )}
                </button>
              ) : (
                <span key={column} />
              ),
            )}
          </div>
        )
      })}
    </div>
  )
}
