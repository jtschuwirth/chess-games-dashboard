'use client'

import { useId, useMemo } from 'react'
import Panel from '@/components/Section'
import { ACCURACY_CAP } from '@/lib/accuracy'
import { STANDING_LABEL, standingOf } from '@/lib/bands'
import { gamePhases } from '@/lib/clocks'
import { formatEval, isFault } from '@/lib/review'
import {
  ARC_BADGE,
  ARC_LABEL,
  TEXTURE_LABEL,
  decidedPhrase,
  tellingHint,
  tellingOf,
} from '@/lib/shape'
import type { GameRecord } from '@/types/chess'

/**
 * The game as a line, and what that line is called.
 *
 * Drawn from White's side, like every other evaluation on this page and like every chess
 * site. Your frame was tried first and it put two frames in one panel: a line rising to
 * the right beside a figure reading −9.0, because the figures go through `formatEval` and
 * that flips. One of them had to move, and the one with company stays. Which half is
 * yours is written inside the chart instead, and the figures under it are *band names*
 * rather than numbers, which have no frame at all.
 *
 * Folded by default and remembered, like every other panel: a thing to look at once, not
 * something to scroll past on the way to the move list.
 */
export default function EvalGraph({
  game,
  onPickPly,
}: {
  game: GameRecord
  /** Put a half-move on the board. The graph is a way of navigating the game too. */
  onPickPly: (ply: number) => void
}) {
  const telling = useMemo(() => tellingOf(game), [game])
  const decided = useMemo(() => (telling ? decidedPhrase(telling) : null), [telling])
  /** Gradient and clip ids are document-wide; two graphs on a page must not share them. */
  const id = useId().replace(/:/g, '')

  if (!telling) return null

  // the stored series is in your frame; the graph is in White's, so Black's is flipped
  const points = telling.shape.points.map(cp => (game.color === 'white' ? cp : -cp))
  const last = Math.max(1, points.length - 1)

  const x = (index: number) => (index / last) * 100
  const y = (cp: number) => 50 - (cp / ACCURACY_CAP) * 50

  const line = points
    .map((cp, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(cp).toFixed(2)}`)
    .join(' ')

  // the same line closed against the middle, so the side that is ahead is the side filled
  const area = `${line} L100,50 L0,50 Z`

  const moves = game.analysis?.moves ?? []

  /**
   * The engine's marks, placed on the line itself.
   *
   * Two points per move of yours, so move `i` lands at index `i * 2 + 1` — the position
   * *after* it, which is where the drop is. They are absolutely positioned HTML rather
   * than SVG circles: the chart is drawn with `preserveAspectRatio="none"`, so a circle
   * in its coordinates comes out an ellipse at whatever width the panel happens to be.
   */
  const faults = moves
    .map((move, index) => ({ move, index }))
    .filter(entry => isFault(entry.move.tag))
    .map(entry => ({
      move: entry.move,
      // held a hair off each edge: a mark on the last move of the game is centred on the
      // chart's own border, and half a dot outside it reads as a rendering fault
      left: Math.min(99, Math.max(1, x(entry.index * 2 + 1))),
      top: y(game.color === 'white' ? entry.move.cpAfter : -entry.move.cpAfter),
    }))

  /**
   * The phases the game actually reached, as the app's own segments.
   *
   * A divider is drawn where each one begins and its label sits under the middle of the
   * stretch it owns, so the chart can be read as "this went wrong in the duel" rather
   * than "this went wrong four fifths of the way along".
   */
  const lastMove = moves.length === 0 ? 0 : moves[moves.length - 1].moveNumber
  const phases = gamePhases().filter(phase => phase.from <= lastMove).map(phase => {
    const from = x((phase.from - 1) * 2)
    const to = phase.to >= lastMove ? 100 : x(phase.to * 2)
    return { ...phase, from, to, middle: (from + to) / 2 }
  })

  return (
    <Panel
      id="eval-graph"
      title="How this game went"
      startFolded
      meta={
        <span
          title={tellingHint(telling)}
          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border cursor-help ${ARC_BADGE[telling.arc]}`}
        >
          {telling.name}
        </span>
      }
    >
      {/* flush to the panel's edges, like the two wide tables: a chart inset by five
          millimetres of card reads as a widget rather than as the thing you came for */}
      <div className="-mx-5 -mt-1 flex flex-col">
        <div className="relative">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-56 block"
            role="img"
            aria-label={`The evaluation through the game: ${telling.name}`}
          >
            <defs>
              <linearGradient id={`${id}-field`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#27272a" />
                <stop offset="100%" stopColor="#1c1c1f" />
              </linearGradient>
              <linearGradient id={`${id}-white`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fafafa" />
                <stop offset="100%" stopColor="#d4d4d8" />
              </linearGradient>
              <linearGradient id={`${id}-black`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#09090b" />
                <stop offset="100%" stopColor="#000000" />
              </linearGradient>
              <clipPath id={`${id}-top`}>
                <rect x="0" y="0" width="100" height="50" />
              </clipPath>
              <clipPath id={`${id}-bottom`}>
                <rect x="0" y="50" width="100" height="50" />
              </clipPath>
            </defs>

            <rect x="0" y="0" width="100" height="100" fill={`url(#${id}-field)`} />

            {/* the same area twice, each half clipped away, so the side that is ahead is
                the side that is filled — one translucent band over both says only "the
                line moved", which is the part you can already see */}
            <path d={area} clipPath={`url(#${id}-top)`} fill={`url(#${id}-white)`} />
            <path d={area} clipPath={`url(#${id}-bottom)`} fill={`url(#${id}-black)`} />

            {phases.slice(1).map(phase => (
              <line
                key={phase.name}
                x1={phase.from}
                y1="0"
                x2={phase.from}
                y2="100"
                stroke="#52525b"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <line
              x1="0"
              y1="50"
              x2="100"
              y2="50"
              stroke="#71717a"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* violet, because this is the engine talking and that is the engine's colour */}
            <path
              d={line}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* everything that must not be stretched sits over the chart, not inside it */}
          <span className="pointer-events-none absolute left-3 top-2 text-[10px] uppercase tracking-wide text-zinc-500">
            white{game.color === 'white' && <Yours />}
          </span>
          <span className="pointer-events-none absolute left-3 bottom-2 text-[10px] uppercase tracking-wide text-zinc-600">
            black{game.color === 'black' && <Yours />}
          </span>

          {faults.map(fault => (
            <button
              key={fault.move.ply}
              type="button"
              onClick={() => onPickPly(fault.move.ply)}
              title={`${fault.move.moveNumber}. ${fault.move.san} ${fault.move.tag} — ${formatEval(
                fault.move.cpBefore,
                game.color,
              )} → ${formatEval(fault.move.cpAfter, game.color)}`}
              aria-label={`Move ${fault.move.moveNumber}, ${fault.move.san}, ${fault.move.tag}`}
              style={{ left: `${fault.left}%`, top: `${fault.top}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border transition-transform hover:scale-150 ${
                fault.move.tag === '??'
                  ? 'bg-red-500 border-red-200/80'
                  : 'bg-amber-400 border-amber-100/80'
              }`}
            />
          ))}
        </div>

        {/* the phase names under the stretch each one owns */}
        <div className="relative h-4 mt-2">
          {phases.map(phase => (
            <span
              key={phase.name}
              title={`${phase.name}, your moves ${phase.label}`}
              style={{ left: `${phase.middle}%` }}
              className="absolute -translate-x-1/2 text-[10px] uppercase tracking-wide text-zinc-600 whitespace-nowrap cursor-help"
            >
              {/* five words do not fit across a phone; the move numbers always do */}
              <span className="sm:hidden">{phase.label}</span>
              <span className="hidden sm:inline">{shortName(phase.name)}</span>
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        <Fact>{ARC_LABEL[telling.arc]}</Fact>
        <Dot />
        <Fact>the lead {TEXTURE_LABEL[telling.texture]}</Fact>
        <Dot />
        best you stood <Fact>{STANDING_LABEL[standingOf(telling.shape.peak)]}</Fact>, worst{' '}
        <Fact>{STANDING_LABEL[standingOf(telling.shape.trough)]}</Fact>
        <Dot />
        {/*
          Where it turned, rather than how far through it turned. The percentage was
          the same measurement in the form you have to convert before it means
          anything — "settled with 23% left" is "threw it in the pre-endgame" read off
          a ruler. The share is still in the tooltip for anyone who wants it.
        */}
        {decided ? (
          <Fact>{decided}</Fact>
        ) : (
          <>
            settled with <Fact>{Math.round((1 - (telling.shape.settledAt ?? 1)) * 100)}% left</Fact>
          </>
        )}
        {telling.offBoard && (
          <>
            <Dot />
            the board was sending it <Fact>{boardWord(telling.shape.end)}</Fact>
          </>
        )}
      </p>
    </Panel>
  )
}

/** The app's own phase names, short enough to sit under a fifth of a chart. */
/**
 * A phase name short enough to sit under a sixth of a chart.
 *
 * The first word of whatever you called it. Derived rather than looked up, now that
 * the names are yours to write — and the first word rather than the longest because
 * it is a rule you can predict: "Structure definition" shortens to `structure`, not
 * to `definition`. If the short form reads badly, the fix is to rename the phase,
 * which is now a thing you can do.
 */
function shortName(name: string): string {
  const first = name.split(/[\s/]+/).find(word => word.length > 0)
  return (first ?? name).toLowerCase()
}


/** Which way the evaluations were pointing, for a game the ending decided instead. */
function boardWord(end: number): string {
  if (end > 0) return 'to White'
  if (end < 0) return 'to Black'
  return 'nowhere'
}

function Yours() {
  return <span className="text-violet-400"> · you</span>
}

function Fact({ children }: { children: React.ReactNode }) {
  return <span className="text-zinc-300">{children}</span>
}

function Dot() {
  return <span className="text-zinc-700"> · </span>
}
