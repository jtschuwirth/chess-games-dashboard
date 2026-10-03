import { squaresFrom } from '@/lib/board'
import type { Color } from '@/types/chess'

/**
 * Solid glyphs for both sides, coloured rather than outlined: the hollow white
 * glyphs render inconsistently across fonts, and a filled pair always matches.
 */
const GLYPH: Record<string, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
}

/**
 * The position, oriented for the side you played. No dragging — this is a board for
 * reading a game, not for playing one.
 */
export default function Board({
  fen,
  orientation,
  highlight = [],
}: {
  fen: string
  orientation: Color
  /** Squares to mark, normally the from and to of the move just played. */
  highlight?: string[]
}) {
  const rows = squaresFrom(fen, orientation)
  const marked = new Set(highlight)

  return (
    <div className="grid grid-cols-8 w-full aspect-square rounded-lg overflow-hidden border border-zinc-700 select-none">
      {rows.flat().map(square => {
        const isMarked = marked.has(square.name)
        const file = square.name[0]
        const rank = square.name[1]
        const showFile = orientation === 'white' ? rank === '1' : rank === '8'
        const showRank = orientation === 'white' ? file === 'a' : file === 'h'

        return (
          <div
            key={square.name}
            className={`relative flex items-center justify-center ${
              square.light ? 'bg-zinc-400' : 'bg-zinc-600'
            }`}
          >
            {isMarked && <span className="absolute inset-0 bg-amber-400/40" />}

            {showRank && (
              <span className="absolute top-0.5 left-1 text-[10px] font-medium text-zinc-900/50">
                {rank}
              </span>
            )}
            {showFile && (
              <span className="absolute bottom-0 right-1 text-[10px] font-medium text-zinc-900/50">
                {file}
              </span>
            )}

            {square.piece && (
              <span
                className={`relative text-[clamp(1.25rem,6vw,2.5rem)] leading-none ${
                  square.piece.color === 'white'
                    ? 'text-white drop-shadow-md'
                    : 'text-zinc-950 drop-shadow-sm'
                }`}
              >
                {GLYPH[square.piece.type]}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
