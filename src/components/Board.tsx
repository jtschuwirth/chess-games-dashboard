'use client'

import { useMemo, useRef, useState } from 'react'
import PieceSprites, { spriteId } from '@/components/PieceSprites'
import { legalMovesFrom, sideToMove, squaresFrom } from '@/lib/board'
import { markBadge } from '@/lib/review'
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

/** A piece in flight, drawn over the page rather than inside the board. */
interface Carrying {
  from: string
  piece: { type: string; color: 'white' | 'black' }
  /** Page coordinates of the pointer, which the piece is centred on. */
  x: number
  y: number
  /** One square, so the carried piece is the size of the one it came from. */
  size: number
}

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
 * Dragging is pointer events and a piece we draw ourselves, not HTML5 drag-and-drop.
 * Two reasons, and the first is the one that forced it: the browser's drag image is a
 * snapshot of the *region* the dragged element occupies, and a chess piece is a
 * transparent element lying on a coloured square — so the square came with it and a
 * cream block floated around the board. Handing the `<svg>` to `setDragImage` does not
 * help; it is composited the same way. The second reason is that HTML5 dragging does
 * not happen at all on a touch screen, and half of this app is used on a phone.
 *
 * The board does not know what a line or a game is. It reports a move from one square
 * to another; whoever owns the position decides what that means.
 */
export default function Board({
  fen,
  orientation,
  highlight = [],
  badge = null,
  onPlay,
}: {
  fen: string
  orientation: Color
  /** Squares to wash, normally the from and to of the move just played. */
  highlight?: string[]
  /**
   * A mark pinned to the square a move landed on — `??` on the one that lost the game.
   *
   * The move list already carries the marks, and reading them there means looking away
   * from the board to find out that the move you are staring at is the mistake. On the
   * square it is the same fact where you are already looking.
   */
  badge?: { square: string; mark: string } | null
  /** Omit to leave the board read-only, which is what most of them are. */
  onPlay?: (move: BoardMove) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  /** A pawn waiting to be told what to become. */
  const [promoting, setPromoting] = useState<{ from: string; to: string } | null>(null)
  /** The piece under the cursor, drawn over the page while it is being carried. */
  const [carrying, setCarrying] = useState<Carrying | null>(null)

  const boardRef = useRef<HTMLDivElement | null>(null)
  /**
   * Whether the pointer travelled far enough to count as a drag.
   *
   * A click is a press and a release on one square, and the two gestures share their
   * first half — so the press cannot decide. Past this it is a drag and the click
   * that follows is swallowed; under it nothing happened and the click stands.
   */
  const dragged = useRef(false)
  /**
   * Where the piece was picked up, in a ref rather than measured against the carried
   * state. Several pointer events can land in one React batch, and every handler in a
   * batch reads the same rendered snapshot — so comparing against the state would be
   * comparing against where the pointer was a frame ago, or against nothing at all on
   * the first move after the press. The same trap the plan page's steppers hit.
   */
  const grabbedAt = useRef({ x: 0, y: 0 })

  /*
    Both of these parse the FEN through chess.js, and carrying a piece re-renders this
    component on every pointer move — which would be a board rebuilt from its text
    sixty times a second for a piece that has not changed anything yet.
  */
  const rows = useMemo(() => squaresFrom(fen, orientation), [fen, orientation])
  const marked = useMemo(() => new Set(highlight), [highlight])
  const interactive = onPlay !== undefined
  const turn = sideToMove(fen)

  const byTarget = useMemo(() => {
    const moves = selected && interactive ? legalMovesFrom(fen, selected) : []
    return new Map(moves.map(move => [move.to, move]))
  }, [fen, selected, interactive])

  /** Which square a point on the page is over, or null when it is off the board. */
  function squareAt(x: number, y: number): string | null {
    const box = boardRef.current?.getBoundingClientRect()
    if (!box) return null

    const column = Math.floor(((x - box.left) / box.width) * 8)
    const row = Math.floor(((y - box.top) / box.height) * 8)
    if (column < 0 || column > 7 || row < 0 || row > 7) return null

    // the grid is drawn from the watching side, so black's view is both axes reversed
    const file = 'abcdefgh'[orientation === 'white' ? column : 7 - column]
    const rank = orientation === 'white' ? 8 - row : row + 1
    return `${file}${rank}`
  }

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

  function startCarry(
    event: React.PointerEvent<HTMLDivElement>,
    square: string,
    piece: { type: string; color: 'white' | 'black' } | null,
  ) {
    // the left button only: a right-click is a context menu, not a move
    if (!interactive || promoting || event.button !== 0) return
    if (!piece || piece.color !== turn) return

    const box = boardRef.current?.getBoundingClientRect()
    if (!box) return

    dragged.current = false
    grabbedAt.current = { x: event.clientX, y: event.clientY }
    setSelected(square)
    setCarrying({ from: square, piece, x: event.clientX, y: event.clientY, size: box.width / 8 })
    // so the move and the release keep coming here even once the pointer leaves the
    // square; it throws on a pointer the browser no longer knows about, and losing
    // capture is worth less than losing the drag
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // carry on without it: the board still gets the move while the pointer is over it
    }
  }

  function moveCarry(event: React.PointerEvent<HTMLDivElement>) {
    const { x, y } = { x: event.clientX, y: event.clientY }
    if (Math.abs(x - grabbedAt.current.x) + Math.abs(y - grabbedAt.current.y) > 3) {
      dragged.current = true
    }
    // the updater form, so two moves in one batch do not both read the same snapshot
    // and leave the piece wherever the first of them put it
    setCarrying(current => (current ? { ...current, x, y } : null))
  }

  function endCarry(event: React.PointerEvent<HTMLDivElement>) {
    // `selected` is the square it was lifted from, and unlike the carried state it is
    // not something a batched move could have left behind
    const from = selected
    setCarrying(null)
    if (!from) return

    // a press and release on one square is a click, and the click handler has it
    if (!dragged.current) return

    const landed = squareAt(event.clientX, event.clientY)
    if (landed && landed !== from) drop(from, landed)
    // dropped on itself or off the board: the piece goes back and stays picked up
  }

  function clickSquare(square: string, piece: { color: 'white' | 'black' } | null) {
    // the tail of a drag, not a click of its own
    if (dragged.current) {
      dragged.current = false
      return
    }

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
    <>
      <div className="relative w-full aspect-square rounded-md overflow-hidden select-none ring-1 ring-black/50 shadow-lg shadow-black/30">
      <PieceSprites />

      {/*
        Rows and columns are both pinned to eight equal fractions. Left to size
        themselves, a row with a tall piece in it grew while an empty row collapsed,
        so the squares changed size as the pieces moved.
      */}
      <div
        ref={boardRef}
        className="grid grid-cols-[repeat(8,minmax(0,1fr))] grid-rows-[repeat(8,minmax(0,1fr))] w-full h-full"
      >
        {rows.flat().map((square, index) => {
          const file = square.name[0]
          const rank = square.name[1]
          // coordinates sit on the outer edge only, the way a printed diagram labels them
          const showFile = orientation === 'white' ? rank === '1' : rank === '8'
          const showRank = orientation === 'white' ? file === 'a' : file === 'h'
          const ink = square.light ? LIGHT_TEXT : DARK_TEXT

          const target = byTarget.get(square.name)
          const piece = square.piece
          const canLift = interactive && piece?.color === turn
          const badgeHere = badge?.square === square.name
          const mark = badgeHere ? markBadge(badge.mark) : null
          /*
            `rows` is already in the order it is drawn, so the first eight are the top
            row and every eighth is the right-hand column — whichever way the board is
            turned. That is what the badge needs: not which square it is, but whether
            there is board left for it to hang over.
          */
          const atTop = index < 8
          const atRight = index % 8 === 7

          return (
            <div
              key={square.name}
              onClick={() => clickSquare(square.name, piece)}
              onPointerDown={event => startCarry(event, square.name, piece)}
              onPointerMove={moveCarry}
              onPointerUp={endCarry}
              onPointerCancel={() => setCarrying(null)}
              /*
                Only a square you can lift from takes the touch away from the page.
                `touch-action: none` is what stops a drag turning into a scroll, and
                putting it on the whole board would mean you could not scroll past the
                board at all on a phone — so it goes on your own pieces and nowhere
                else, and a swipe over anything else still scrolls.
              */
              style={canLift ? { touchAction: 'none' } : undefined}
              className={`relative ${square.light ? LIGHT : DARK} ${
                canLift ? 'cursor-grab active:cursor-grabbing' : target ? 'cursor-pointer' : ''
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
                It never catches the pointer: the square underneath handles the whole
                gesture, so picking a piece up and dropping one on it are the same
                element's business.
              */}
              {piece && (
                <svg
                  viewBox="0 0 45 45"
                  className={`absolute inset-0 w-full h-full pointer-events-none ${
                    carrying?.from === square.name ? 'opacity-25' : ''
                  }`}
                  role="img"
                  aria-label={`${piece.color} piece on ${square.name}`}
                >
                  <use href={`#${spriteId(piece.type, piece.color)}`} />
                </svg>
              )}

              {/*
                Over the piece, because it is about the piece. Drawn in the square's
                own viewBox like the sprites are, so it scales exactly with the board at
                every width instead of needing a font size per breakpoint.

                It straddles the corner, which is how a chess site draws one and reads
                better than a circle tucked inside the square. The board clips its own
                overflow, though, so a badge on the top row or the right-hand column
                would come out as a circle with a slice missing — which is not rare, since
                a mistake lands on an edge square often enough. So it is pulled flush on
                exactly those squares and straddles everywhere else: the look is kept
                where there is room for it and dropped only where it cannot be had.
              */}
              {badgeHere && mark && (
                <svg
                  viewBox="0 0 45 45"
                  className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                  role="img"
                  aria-label={`${badge!.mark} ${mark.label}`}
                >
                  <circle
                    cx={atRight ? 34.5 : 38.5}
                    cy={atTop ? 10.5 : 6.5}
                    r="10.5"
                    fill={mark.fill}
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth="0.6"
                  />
                  <text
                    x={atRight ? 34.5 : 38.5}
                    y={atTop ? 10.5 : 6.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={badge!.mark.length > 1 ? 11 : 14}
                    fontWeight="700"
                    fill={mark.ink}
                  >
                    {badge!.mark}
                  </text>
                </svg>
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

      {/*
        The piece you are carrying, drawn over the page at the pointer.

        `fixed` rather than absolute, so it is positioned in the same coordinates the
        pointer events report and needs no arithmetic against the board's offset; and
        `pointer-events-none`, or it would be the thing under the cursor and every
        square would stop receiving the move.
      */}
      {carrying && (
        <svg
          viewBox="0 0 45 45"
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: carrying.x,
            top: carrying.y,
            width: carrying.size,
            height: carrying.size,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          <use href={`#${spriteId(carrying.piece.type, carrying.piece.color)}`} />
        </svg>
      )}

    </>
  )
}

const PIECE_NAME: Record<string, string> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
}
