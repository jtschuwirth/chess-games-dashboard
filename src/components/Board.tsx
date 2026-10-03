import PieceSprites, { spriteId } from '@/components/PieceSprites'
import { squaresFrom } from '@/lib/board'
import type { Color } from '@/types/chess'

/**
 * Board colours, kept off the zinc palette on purpose: a chess board has to read as
 * a chess board, and the familiar cream and green is far easier to follow than two
 * shades of grey. The highlight is the usual yellow wash over the move just played.
 */
const LIGHT = 'bg-[#ebecd0]'
const DARK = 'bg-[#7b9a5e]'
const LIGHT_TEXT = 'text-[#7b9a5e]'
const DARK_TEXT = 'text-[#ebecd0]'

/**
 * The position, oriented for whichever side you are watching from. No dragging —
 * this is a board for reading a game, not for playing one.
 */
export default function Board({
  fen,
  orientation,
  highlight = [],
}: {
  fen: string
  orientation: Color
  /** Squares to wash, normally the from and to of the move just played. */
  highlight?: string[]
}) {
  const rows = squaresFrom(fen, orientation)
  const marked = new Set(highlight)

  return (
    <div className="w-full aspect-square rounded-md overflow-hidden select-none ring-1 ring-black/50 shadow-lg shadow-black/30">
      <PieceSprites />

      {/*
        Rows and columns are both pinned to eight equal fractions. Left to size
        themselves, a row with a tall piece in it grew while an empty row collapsed,
        so the squares changed size as the pieces moved.
      */}
      <div className="grid grid-cols-[repeat(8,minmax(0,1fr))] grid-rows-[repeat(8,minmax(0,1fr))] w-full h-full">
        {rows.flat().map(square => {
          const file = square.name[0]
          const rank = square.name[1]
          // coordinates sit on the outer edge only, the way a printed diagram labels them
          const showFile = orientation === 'white' ? rank === '1' : rank === '8'
          const showRank = orientation === 'white' ? file === 'a' : file === 'h'
          const ink = square.light ? LIGHT_TEXT : DARK_TEXT

          return (
            <div
              key={square.name}
              className={`relative ${square.light ? LIGHT : DARK}`}
            >
              {marked.has(square.name) && (
                <span className="absolute inset-0 bg-[#f6d656]/45" aria-hidden="true" />
              )}

              {showRank && (
                <span
                  className={`absolute top-px left-1 text-[0.58rem] font-semibold leading-none ${ink}`}
                >
                  {rank}
                </span>
              )}
              {showFile && (
                <span
                  className={`absolute bottom-px right-1 text-[0.58rem] font-semibold leading-none ${ink}`}
                >
                  {file}
                </span>
              )}

              {/* absolutely placed, so nothing a square contains can change its size */}
              {square.piece && (
                <svg
                  viewBox="0 0 45 45"
                  className="absolute inset-0 w-full h-full"
                  role="img"
                  aria-label={`${square.piece.color} piece on ${square.name}`}
                >
                  <use href={`#${spriteId(square.piece.type, square.piece.color)}`} />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
