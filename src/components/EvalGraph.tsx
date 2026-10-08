'use client'

import { useId, useMemo } from 'react'
import Panel from '@/components/Section'
import { ACCURACY_CAP } from '@/lib/accuracy'
import { STANDING_LABEL, standingOf } from '@/lib/bands'
import { formatEval, isFault, markColor } from '@/lib/review'
import { ARC_BADGE, ARC_LABEL, TEXTURE_LABEL, tellingHint, tellingOf } from '@/lib/shape'
import type { GameRecord } from '@/types/chess'

/**
 * The game as a line, and what that line is called.
 *
 * Drawn from White's side, like every other evaluation on this page and like every
 * chess site. Your frame was tried first, on the reasoning that "how did this go for me"
 * wants up to mean good — and it put two frames in one panel: a line rising to the right
 * beside a figure reading −9.0, because the figures go through `formatEval` and that
 * flips. One of them had to move, and the one with company stays.
 *
 * The axis names the colours and says which one is you, so there is nothing to remember;
 * and the figures beside it are *band names* rather than numbers, which have no frame at
 * all — "best you stood: winning" is true from either end of the board.
 *
 * Folded by default and remembered, like every other panel: it is a thing to look at
 * once, not something to scroll past on the way to the move list.
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
  /** Clip paths are document-wide, so two graphs on one page must not share ids. */
  const id = useId()

  /** Which half-moves the engine marked, so the line can carry them. */
  const marks = useMemo(() => {
    const out = new Map<number, string>()
    for (const move of game.analysis?.moves ?? []) {
      if (isFault(move.tag)) out.set(move.ply, move.tag)
    }
    return out
  }, [game])

  if (!telling) return null

  // the stored series is in your frame; the graph is in White's, so Black's is flipped
  const points = telling.shape.points.map(cp => (game.color === 'white' ? cp : -cp))
  const last = points.length - 1

  const x = (index: number) => (index / Math.max(1, last)) * 100
  const y = (cp: number) => 50 - (cp / ACCURACY_CAP) * 50

  const line = points
    .map((cp, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(cp).toFixed(2)}`)
    .join(' ')

  // the same line closed against the middle, so the side you are on is shaded
  const area = `${line} L100,50 L0,50 Z`

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
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <div className="flex flex-col justify-between text-[10px] uppercase tracking-wide text-zinc-600 shrink-0 py-0.5 w-12">
            <span className={game.color === 'white' ? 'text-zinc-400' : undefined}>
              white{game.color === 'white' ? ' · you' : ''}
            </span>
            <span className={game.color === 'black' ? 'text-zinc-400' : undefined}>
              black{game.color === 'black' ? ' · you' : ''}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-40 rounded-lg border border-zinc-800"
              role="img"
              aria-label={`The evaluation through the game: ${telling.name}`}
            >
              {/*
                The same area twice, each half clipped away, so the side that is ahead is
                the side that is filled: light for White, dark for Black, against a field
                that is neither. One translucent band over both was the first attempt and
                it says only "the line moved" — which is the part you can already see. A
                block of white reaching down the middle of the graph is the game.
              */}
              <defs>
                <clipPath id={`${id}-white`}>
                  <rect x="0" y="0" width="100" height="50" />
                </clipPath>
                <clipPath id={`${id}-black`}>
                  <rect x="0" y="50" width="100" height="50" />
                </clipPath>
              </defs>

              <rect x="0" y="0" width="100" height="100" className="fill-zinc-800" />
              <path d={area} clipPath={`url(#${id}-white)`} className="fill-zinc-300" />
              <path d={area} clipPath={`url(#${id}-black)`} className="fill-zinc-950" />

              <line
                x1="0"
                y1="50"
                x2="100"
                y2="50"
                className="stroke-zinc-600"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {/* violet, because this is the engine talking and that is the engine's colour */}
              <path
                d={line}
                fill="none"
                className="stroke-violet-400"
                strokeWidth="1.5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>

        {/*
          The marked moves under the line rather than on it: a dot on a 100x100 viewBox
          scaled to the panel's width is an ellipse, and the one thing a mark has to do is
          be the right shape to click.
        */}
        <div className="flex gap-1.5 flex-wrap pl-15">
          {[...marks].map(([ply, tag]) => {
            const move = (game.analysis?.moves ?? []).find(entry => entry.ply === ply)
            if (!move) return null

            return (
              <button
                key={ply}
                type="button"
                onClick={() => onPickPly(ply)}
                title={`${formatEval(move.cpBefore, game.color)} → ${formatEval(move.cpAfter, game.color)} — put it on the board`}
                className="px-2 py-0.5 text-xs font-mono rounded-full border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100 transition-colors"
              >
                {move.moveNumber}. {move.san}
                <span className={markColor(tag)}> {tag}</span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-x-5 gap-y-1 flex-wrap text-xs text-zinc-500 border-t border-zinc-800 pt-3">
          <Fact label="what became of the lead" value={ARC_LABEL[telling.arc]} />
          <Fact label="lead changed hands" value={TEXTURE_LABEL[telling.texture]} />
          {/* band names, not numbers: they read the same from either end of the board */}
          <Fact label="best you stood" value={STANDING_LABEL[standingOf(telling.shape.peak)]} />
          <Fact label="worst" value={STANDING_LABEL[standingOf(telling.shape.trough)]} />
          <Fact
            label="settled with"
            value={`${Math.round((1 - (telling.shape.settledAt ?? 1)) * 100)}% left`}
          />
          {telling.offBoard && (
            <Fact label="the board was sending it" value={boardWord(game, telling)} />
          )}
        </div>
      </div>
    </Panel>
  )
}

/** Which way the evaluations were pointing, for a game the ending decided instead. */
function boardWord(game: GameRecord, telling: NonNullable<ReturnType<typeof tellingOf>>): string {
  const end = telling.shape.end
  if (end > 0) return 'your way'
  if (end < 0) return 'their way'
  return 'nowhere'
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </span>
  )
}
