'use client'

import {
  MIN_TREND_WINDOW,
  accuracyTrend,
  faultRate,
  mistakesByThinkTime,
  type GameAccuracy,
} from '@/lib/accuracy'
import { ENGINE_DEPTH } from '@/lib/analysis'
import type { GameRecord } from '@/types/chess'

/**
 * Per-game accuracy as a line, oldest on the left.
 *
 * Drawn rather than charted: one inline SVG against a charting library is a few lines
 * here and nothing to keep up to date, and the shape is the whole message — the numbers
 * are already written beside it. Lower is better, so the line is flipped, and the y axis
 * starts at zero so a flat run looks flat instead of looking like noise.
 */
function Sparkline({ points }: { points: GameAccuracy[] }) {
  if (points.length < 2) return null

  const width = 100
  const height = 28
  const top = Math.max(...points.map(point => point.acpl), 1)

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width
      const y = height - (point.acpl / top) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-10"
      role="img"
      aria-label={`Centipawn loss across ${points.length} analysed games, oldest first`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="text-zinc-400" />
    </svg>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="text-lg font-semibold text-zinc-100">{value}</span>
      {hint && <span className="text-xs text-zinc-600">{hint}</span>}
    </div>
  )
}

/**
 * What the engine knows about this slice, as two readings: how much you give away per
 * move, and whether it depends on how long you thought.
 *
 * Both say out loud how many games they are built from, because both silently drop every
 * game that was never analysed — and a number over four games invites a conclusion it
 * cannot carry.
 */
export default function AccuracyPanel({ games }: { games: GameRecord[] }) {
  const trend = accuracyTrend(games)
  const buckets = mistakesByThinkTime(games)
  const timed = buckets.reduce((total, bucket) => total + bucket.moves, 0)

  if (trend.points.length === 0) {
    return (
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">Engine readings</h2>
        <p className="text-sm text-zinc-500">
          Nothing analysed at depth {ENGINE_DEPTH} in this slice yet. Open a game and run the
          engine — these build up as you go.
        </p>
      </section>
    )
  }

  // floored at 1 so the division is safe when nothing is marked at all
  const worst = Math.max(...buckets.map(bucket => faultRate(bucket) ?? 0), 1)
  const change =
    trend.recent !== null && trend.previous !== null ? trend.recent - trend.previous : null

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">Engine readings</h2>
        <span className="text-xs text-zinc-600">
          {trend.points.length} game{trend.points.length === 1 ? '' : 's'} analysed at depth{' '}
          {ENGINE_DEPTH}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-4">
            <Figure
              label="Centipawn loss"
              value={
                trend.recent !== null
                  ? trend.recent.toFixed(0)
                  : (
                      trend.points.reduce((sum, point) => sum + point.acpl, 0) /
                      trend.points.length
                    ).toFixed(0)
              }
              hint={
                trend.window > 0
                  ? `per move over your last ${trend.window} games · 100 is a pawn`
                  : 'per move, every analysed game · 100 is a pawn'
              }
            />

            {change !== null && (
              <span
                className={`text-sm font-medium ${
                  change < 0 ? 'text-emerald-400' : change > 0 ? 'text-red-400' : 'text-zinc-500'
                }`}
                title={`Against the ${trend.window} games before those`}
              >
                {change > 0 ? '+' : ''}
                {change.toFixed(0)}
              </span>
            )}
          </div>

          <Sparkline points={trend.points} />

          <p className="text-xs text-zinc-600">
            {change === null
              ? `A comparison needs ${MIN_TREND_WINDOW * 2} analysed games; there are ${
                  trend.points.length
                }.`
              : change < 0
                ? 'Lower than the run before it — you are giving away less.'
                : change > 0
                  ? 'Higher than the run before it.'
                  : 'Unchanged against the run before it.'}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {/* a heading, not a figure: the move count is already on every row */}
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Mistakes by think time
          </span>

          {timed === 0 ? (
            <p className="text-xs text-zinc-600">
              None of these games carry clock readings — daily games, or games synced before
              clocks were captured.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[4.5rem_1fr_3.5rem] gap-2 text-[10px] uppercase tracking-wide text-zinc-600">
                <span>Spent</span>
                <span />
                <span className="text-right">Marked</span>
              </div>

              {buckets.map(bucket => {
                const rate = faultRate(bucket)
                return (
                  <div key={bucket.label} className="grid grid-cols-[4.5rem_1fr_3.5rem] gap-2 items-center">
                    <span className="text-xs text-zinc-500">{bucket.label}</span>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      {rate !== null && (
                        <div
                          className="h-full bg-amber-500/70 rounded-full"
                          style={{ width: `${(rate / worst) * 100}%` }}
                        />
                      )}
                    </div>
                    <span className="text-xs text-right text-zinc-400 font-mono">
                      {rate === null ? '—' : `${rate.toFixed(0)}%`}
                      <span className="text-zinc-700"> /{bucket.moves}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-xs text-zinc-600">
            Of the moves you spent that long on, this share carried an engine mark — each band is
            measured against its own total, so they do not add up to 100. Bars run against the
            worst band{worst > 0 ? ` (${worst.toFixed(0)}%)` : ''}, not against 100%.
          </p>
          <p className="text-xs text-zinc-600">
            A hard position takes longer <em>and</em>{' '}
            goes wrong more often, so a slow band being worse is partly the position&apos;s doing.
            Read it against your own past, not as a rule.
          </p>
        </div>
      </div>
    </section>
  )
}
