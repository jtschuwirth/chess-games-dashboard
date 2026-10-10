'use client'

import { useState } from 'react'
import PieceSprites, { spriteId } from '@/components/PieceSprites'
import { legalMovesFrom, sideToMove, squaresFrom } from '@/lib/board'
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

/** The pieces a pawn may become, in the order anyone actually wants them. */
const PROMOTIONS = ['q', 'r', 'b', 'n'] as const

export interface BoardMove {
  from: string
  to: string
  /** Set only when the move is a promotion. */
  promotion?: string
}

/**
 * The position, oriented for whichever side you are watching from — and, when the
 * caller can do something with a move, one you can play on.
 *
 * Input is the same board as reading, not a second component: every surface in this
 * app shows a position, and whether you may change it is a property of the surface
 * rather than of the board. Pass `onPlay` and it becomes interactive; leave it out
 * and nothing about the markup changes.
 *
 * Two ways in, because one of them does not work everywhere. Click a piece then click
 * a square works on a phone and with a keyboard; dragging is what a mouse expects.
 * Both end in the same `onPlay`, and legality is chess.js's answer in both cases —
 * the board offers only squares a piece can actually reach, so an illegal move is not
 * refused so much as unreachable.
 *
 * The board does not know what a line or a game is. It reports a move from one square
 * to another; whoever owns the position decides what that means.
 */
export default function Board({
  fen,
  orientation,
  highlight = [],
  onPlay,
}: {
  fen: string
  orientation: Color
  /** Squares to wash, normally the from and to of the move just played. */
  highlight?: string[]
  /** Omit to leave the board read-only, which is what most of them are. */
  onPlay?: (move: BoardMove) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  /** A pawn waiting to be told what to become. */
  const [promoting, setPromoting] = useState<{ from: string; to: string } | null>(null)

  const rows = squaresFrom(fen, orientation)
  const marked = new Set(highlight)
  const interactive = onPlay !== undefined
  const turn = sideToMove(fen)

  const destinations = selected && interactive ? legalMovesFrom(fen, selected) : []
  const byTarget = new Map(destinations.map(move => [move.to, move]))

  function pickUp(square: string, piece: { color: 'white' | 'black' } | null) {
    // only the side to move: picking up a piece that cannot move is a dead end you
    // have to work out, where nothing happening says it immediately
    if (!piece || piece.color !== turn) return false
    setSelected(square)
    return true
  }

  /** Land on a square. Returns whether it was a move, so a click can fall through. */
  function drop(from: string, to: string): boolean {
    const target = legalMovesFrom(fen, from).find(move => move.to === to)
    if (!target) return false

    if (target.promotion) {
      setPromoting({ from, to })
      setSelected(null)
      return true
    }

    setSelected(null)
    onPlay?.({ from, to })
    return true
  }

  function clickSquare(square: string, piece: { color: 'white' | 'black' } | null) {
    if (!interactive || promoting) return

    if (selected) {
      if (square === selected) {
        setSelected(null)
        return
      }
      // a move if it can be one, otherwise treat it as picking up the piece there
      if (drop(selected, square)) return
    }

    if (!pickUp(square, piece)) setSelected(null)
  }

  return (
    <div className="relative w-full aspect-square rounded-md overflow-hidden select-none ring-1 ring-black/50 shadow-lg shadow-black/30">
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

          const target = byTarget.get(square.name)
          const piece = square.piece
          const canLift = interactive && piece?.color === turn

          return (
            <div
              key={square.name}
              onClick={() => clickSquare(square.name, piece)}
              onDragOver={event => {
                if (interactive && selected && byTarget.has(square.name)) event.preventDefault()
              }}
              onDrop={event => {
                if (!interactive || !selected) return
                event.preventDefault()
                drop(selected, square.name)
              }}
              className={`relative ${square.light ? LIGHT : DARK} ${
                canLift || target ? 'cursor-pointer' : ''
              }`}
            >
              {marked.has(square.name) && (
                <span className="absolute inset-0 bg-[#f6d656]/45" aria-hidden="true" />
              )}
              {selected === square.name && (
                <span className="absolute inset-0 bg-[#f6d656]/60" aria-hidden="true" />
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

              {/*
                Absolutely placed, so nothing a square contains can change its size.
                The draggable wrapper is a span rather than the svg — SVG elements
                take no `draggable` in React's typings — and rather than the square
                itself, so the thing dragging under the cursor is the piece and not a
                cream rectangle with a piece on it.
              */}
              {piece && (
                <span
                  draggable={canLift}
                  onDragStart={() => pickUp(square.name, piece)}
                  onDragEnd={() => setSelected(null)}
                  className={`absolute inset-0 ${canLift ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <svg
                    viewBox="0 0 45 45"
                    className="w-full h-full"
                    role="img"
                    aria-label={`${piece.color} piece on ${square.name}`}
                  >
                    <use href={`#${spriteId(piece.type, piece.color)}`} />
                  </svg>
                </span>
              )}

              {/*
                Where the selected piece can go: a dot on an empty square, a ring
                round an occupied one. The usual pair, and the reason they differ is
                that a dot drawn over a piece hides the thing you are about to take.
                Over the piece, so it is not hidden by it.
              */}
              {target && !target.capture && (
                <span
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  aria-hidden="true"
                >
                  <span className="w-[30%] h-[30%] rounded-full bg-black/25" />
                </span>
              )}
              {target && target.capture && (
                <span
                  className="absolute inset-[6%] rounded-full ring-[0.35rem] ring-black/25 pointer-events-none"
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>

      {/*
        The promotion choice, over the board rather than in a dialog: you are looking
        at the square, and the four pieces belong beside it. Dismissed by the backdrop,
        because changing your mind about the move is more common than about the piece.
      */}
      {promoting && (
        <div
          className="absolute inset-0 bg-black/60 flex items-center justify-center"
          onClick={() => setPromoting(null)}
        >
          {/*
            Sized against the board rather than its own contents. The buttons were
            `w-[12%]`, which is a percentage of a box that was itself sizing to them —
            browsers resolve that against an indefinite width and the panel stretched
            the whole width of the board.
          */}
          <div className="flex gap-1 p-1.5 w-[56%] rounded-lg bg-zinc-900 ring-1 ring-zinc-700 shadow-xl">
            {PROMOTIONS.map(piece => (
              <button
                key={piece}
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  const move = promoting
                  setPromoting(null)
                  onPlay?.({ from: move.from, to: move.to, promotion: piece })
                }}
                title={PIECE_NAME[piece]}
                aria-label={`Promote to ${PIECE_NAME[piece]}`}
                className="flex-1 aspect-square rounded bg-zinc-800 hover:bg-zinc-700 transition-colors p-0.5"
              >
                <svg viewBox="0 0 45 45" className="w-full h-full" aria-hidden="true">
                  <use href={`#${spriteId(piece, turn)}`} />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const PIECE_NAME: Record<string, string> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
}
