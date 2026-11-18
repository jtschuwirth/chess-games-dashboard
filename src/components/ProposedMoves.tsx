'use client'

import Chip from '@/components/Chip'
import { lineSteps, verdictKey } from '@/lib/review'
import { MAX_LINE_PLIES, lineTokens, parseLine } from '@/lib/board'
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
  /**
   * A line you looked at and ruled out, rather than one you would play.
   *
   * "Nc6 does not work, they have Bxd4" is as much a part of a post-mortem as the move
   * you should have found, and there was nowhere to put it — written in as an
   * alternative it came back marked correct in the drill.
   */
  rejected?: boolean
}

export const EMPTY_ROW: ProposedRow = { input: '', why: '' }

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
  boardLine,
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
  /**
   * The line currently played out on the game's board, starting from this entry's
   * move. Empty when the board is somewhere else.
   */
  boardLine?: string[]
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
        const steps = played && fenBefore ? lineSteps(fenBefore, played.line, played.fens) : []

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
                } ${row.rejected ? 'text-zinc-400 line-through decoration-zinc-700' : ''}`}
              />

              {/*
                Which kind of line this is. Two chips rather than a checkbox, because
                it is a choice between two things you do rather than a box to tick —
                and the default has to be visible: a row that said nothing would read
                as a move you are recommending, which is exactly the confusion this is
                here to end.
              */}
              <div className="flex gap-1 shrink-0 pt-1">
                <Chip
                  active={!row.rejected}
                  onClick={() => setRow(index, { rejected: false })}
                  title="A line you would play"
                >
                  would play
                </Chip>
                <Chip
                  active={row.rejected === true}
                  onClick={() => setRow(index, { rejected: true })}
                  title="A line you looked at and ruled out — it is kept, and never offered as your answer in a drill"
                >
                  ruled out
                </Chip>
              </div>
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

            {/*
              Every move of the line, each with its own reading.
              
              Only the first used to be judged, on the grounds that the rest depends on
              the opponent playing along — true about what the line *commits* you to,
              and the wrong thing to hang a reading on: a plan that goes wrong at move
              four is wrong, and the form said nothing about move four. The moves are a
              row of their own so a long line wraps as moves rather than as a sentence.
            */}
            {steps.length > 0 && (
              <div className="flex gap-x-3 gap-y-1 flex-wrap text-xs font-mono">
                {steps.map((step, at) => {
                  const verdict = verdicts[verdictKey(step.before, step.san)]
                  const prefix = lineTokens(ply, played!.line)[at].prefix

                  return (
                    <span key={at} className="inline-flex items-baseline gap-1">
                      {prefix && <span className="text-zinc-600">{prefix}</span>}
                      <span
                        className={
                          verdict && verdict !== 'failed' && verdict.tag !== null
                            ? isFault(verdict.tag)
                              ? markColor(verdict.tag)
                              : 'text-emerald-400'
                            : 'text-zinc-300'
                        }
                      >
                        {step.san}
                        {verdict && verdict !== 'failed' && verdict.tag !== null && isFault(verdict.tag)
                          ? verdict.tag
                          : ''}
                      </span>
                      <span
                        className="text-zinc-500"
                        title={
                          verdict === undefined
                            ? undefined
                            : verdict === 'failed'
                              ? 'The engine did not answer for this one'
                              : verdict.tag === null
                                ? `Where ${step.san} leaves the game, from White's side`
                                : isFault(verdict.tag)
                                  ? `${step.san} gives something away`
                                  : `${step.san} holds the position`
                        }
                      >
                        {verdict === undefined
                          ? '…'
                          : verdict === 'failed'
                            ? '—'
                            : `${formatEval(verdict.cpBefore, color)} → ${formatEval(verdict.cpAfter, color)}`}
                      </span>
                    </span>
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap text-xs">
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
              placeholder={row.rejected ? 'they have Bxd4 and the knight is just lost' : whyPlaceholder}
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
        {/*
          The other direction. Playing a line out on the board already makes it a
          branch of the game's tree, so the line you have been looking at is a line
          this form can simply take — rather than asking you to read it off the board
          and type it back in. It lands in the first empty row, or a new one.
        */}
        {boardLine && boardLine.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const line = boardLine.join(' ')
              const empty = rows.findIndex(row => row.input.trim().length === 0)
              if (empty === -1) onChange([...rows, { input: line, why: '' }])
              else onChange(rows.map((row, at) => (at === empty ? { ...row, input: line } : row)))
            }}
            title={`Take ${boardLine.join(' ')} from the board`}
            className="text-violet-300 hover:text-violet-100 transition-colors"
          >
            ← take the line from the board
          </button>
        )}
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
