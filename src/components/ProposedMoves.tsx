'use client'

import { MAX_LINE_PLIES, formatLine, parseLine } from '@/lib/board'
import { ENGINE_DEPTH, type MoveTag } from '@/lib/analysis'
import { formatEval, isFault, markColor } from '@/lib/review'
import type { Color } from '@/types/chess'

/**
 * How a proposed move turned out when the engine looked at it.
 *
 * Both numbers are in your frame, like every stored evaluation in this app. `tag` is
 * null on a move that is not yours: whether a line gives something away is a judgement
 * about the player who would play it, and on your opponent's turn that is a statement
 * about them which this form is not making.
 */
export type Verdict = { cpBefore: number; cpAfter: number; tag: MoveTag | null } | 'failed'

/** A line being proposed. `input` is what you typed; it is parsed as you type. */
export interface ProposedRow {
  input: string
  why: string
}

export const EMPTY_ROW: ProposedRow = { input: '', why: '' }

/**
 * The key a line's verdict is filed under. `ply:san` of its *first* move, because only
 * that move is a decision you get to make — everything after it depends on the
 * opponent playing along, so it is the only part that can be judged.
 */
export function verdictKey(ply: number, firstMove: string): string {
  return `${ply}:${firstMove}`
}

const FIELD =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/**
 * The lines you would play, with the engine's reading of each.
 *
 * Shared by the two kinds of review entry. On a mistake these are what you should have
 * played and the engine's verdict is the point — an idea that answers a blunder with
 * another blunder is worth knowing about before you write it down as the lesson. On a
 * note they are the moves you were choosing between, and the verdict is just context.
 *
 * It renders rows and reads verdicts; it does not run the engine. The owner collects
 * every line on screen into one debounced pass, so typing does not queue work and a
 * move proposed twice is only judged once.
 */
export default function ProposedMoves({
  label,
  hint,
  ply,
  rows,
  fenBefore,
  color,
  verdicts,
  onChange,
  linePlaceholder,
  whyPlaceholder,
  addLabel,
  asking,
  onAsk,
  engineAnswer,
}: {
  label: string
  hint?: string
  ply: number
  rows: ProposedRow[]
  /** The position the lines start from, or null when the ply is not in the game. */
  fenBefore: string | null
  /** Whose game it is, so the evaluations read from White's side either way. */
  color: Color
  verdicts: Record<string, Verdict>
  onChange: (rows: ProposedRow[]) => void
  linePlaceholder: string
  whyPlaceholder: string
  addLabel: string
  asking: boolean
  onAsk: () => void
  /** The engine's own move, once asked for. */
  engineAnswer?: string
}) {
  const setRow = (index: number, changes: Partial<ProposedRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...changes } : row)))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        {hint && <span className="text-xs text-zinc-600">{hint}</span>}
      </div>

      {rows.map((row, index) => {
        const parsed = fenBefore ? parseLine(fenBefore, row.input) : null
        const played = parsed && parsed.line.length > 0 ? parsed : null
        const verdict = played ? verdicts[verdictKey(ply, played.line[0])] : undefined

        return (
          <div
            key={index}
            className="border border-zinc-800 rounded-lg p-3 flex flex-col gap-2 bg-zinc-950/30"
          >
            <div className="flex gap-2 items-start">
              <input
                value={row.input}
                onChange={event => setRow(index, { input: event.target.value })}
                placeholder={linePlaceholder}
                aria-label="Line"
                className={`${FIELD} font-mono flex-1 min-w-0 ${
                  parsed?.invalid ? 'border-red-500/60' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((entry, at) => at !== index))}
                title="Remove this line"
                aria-label="Remove this line"
                className="text-xs text-zinc-600 hover:text-red-400 transition-colors px-1 py-2 shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs">
              {played && (
                <span className="text-zinc-400 font-mono">{formatLine(ply, played.line)}</span>
              )}

              {played &&
                (verdict === undefined ? (
                  <span className="text-zinc-600">checking…</span>
                ) : verdict === 'failed' ? (
                  <span className="text-zinc-600">not checked</span>
                ) : (
                  <span
                    className={`font-mono ${
                      verdict.tag === null
                        ? 'text-zinc-400'
                        : isFault(verdict.tag)
                          ? markColor(verdict.tag)
                          : 'text-emerald-400'
                    }`}
                    title={
                      verdict.tag === null
                        ? `Where ${played.line[0]} would leave the game, from White's side`
                        : isFault(verdict.tag)
                          ? `${played.line[0]} gives something away too`
                          : `${played.line[0]} holds the position`
                    }
                  >
                    {formatEval(verdict.cpBefore, color)} → {formatEval(verdict.cpAfter, color)}
                    {verdict.tag !== null && isFault(verdict.tag) && ` ${verdict.tag}`}
                  </span>
                ))}

              {parsed?.invalid && (
                <span className="text-red-400">
                  {played ? 'the line stops at' : 'not legal here:'} {parsed.invalid}
                </span>
              )}
              {parsed?.tooLong && (
                <span className="text-amber-400">
                  lines stop at {MAX_LINE_PLIES / 2} moves each
                </span>
              )}
            </div>

            <textarea
              value={row.why}
              onChange={event => setRow(index, { why: event.target.value })}
              rows={2}
              aria-label="Why this line"
              placeholder={whyPlaceholder}
              className={`${FIELD} w-full resize-y`}
            />
          </div>
        )
      })}

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <button
          type="button"
          onClick={() => onChange([...rows, EMPTY_ROW])}
          className="text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          {addLabel}
        </button>
        <button
          type="button"
          onClick={onAsk}
          disabled={asking}
          title={`What the engine plays here, at depth ${ENGINE_DEPTH}`}
          className="text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
        >
          {asking ? 'asking the engine…' : "engine's choice"}
        </button>
        {engineAnswer && <span className="text-sky-300 font-mono">{engineAnswer}</span>}
      </div>
    </div>
  )
}
