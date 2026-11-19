'use client'

import Chip from '@/components/Chip'
import { formatEvalGuess, parseEvalInput, passesFor } from '@/lib/daily'
import type { MoveLog, MoveStepId } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/**
 * The loop as a form: what you write before playing one move.
 *
 * It renders the same `METHOD_PASSES` table the method page draws, so the questions
 * cannot differ between the screen that teaches the procedure and the screen that asks
 * it of you — and a fifth question arrives in both at once.
 *
 * **The gate is a control rather than a note**, and it is what makes filling this in
 * the same act as running the method: answering *yes, something concrete* takes the
 * plan pass off the form, because there was nothing quiet to plan in. Answering *no*
 * puts it back. The form therefore branches where the method branches, instead of
 * showing fourteen boxes and trusting you to know which eight to skip.
 *
 * The evaluation sits at the top rather than at the end, because it is asked on every
 * move whichever way the gate went — and because writing it before the commit check
 * keeps it an estimate of the position rather than a note about the move you had
 * already settled on.
 */
export default function MoveLogForm({
  log,
  inBook,
  onBook,
  onChange,
}: {
  log: MoveLog
  /** Whether your preparation still covers this move. */
  inBook: boolean
  /** Move the end of the book to this move, or past it. */
  onBook: (out: boolean) => void
  onChange: (update: (current: MoveLog) => MoveLog) => void
}) {
  const passes = passesFor(log.concrete, inBook)

  function setAnswer(id: MoveStepId, text: string) {
    onChange(current => {
      const answers = { ...current.answers }
      // deleted rather than set empty: an optional field assigned `undefined` rejects
      // the whole document, and an empty string is a question answered with nothing
      if (text.length === 0) delete answers[id]
      else answers[id] = text
      return { ...current, answers }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        Out of book, the fact is a line rather than a control: it is true of the whole
        rest of the game and you are not deciding it again on every move. It stays
        pressable because a mispress has to be undoable from the move it was made on.
      */}
      {/*
        The evaluation is not asked in book either. You are recalling a move rather than
        judging a position, and a number written to fill a box is worse than no number at
        all — the post-mortem would score it as an opinion you never held.
      */}
      {!inBook && (
        <>
          <p className="text-xs text-zinc-600">
            Past your preparation.{' '}
            <button
              type="button"
              onClick={() => onBook(false)}
              className="underline hover:text-zinc-300 transition-colors"
            >
              this move was still book
            </button>
          </p>

          <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span
            className="text-xs uppercase tracking-wide text-zinc-500"
            title="From White's side, which is the frame every board and engine reading in the app shows"
          >
            My eval
          </span>
          <input
            defaultValue={formatEvalGuess(log.evaluation)}
            key={`eval-${log.ply}`}
            onBlur={event =>
              onChange(current => ({
                ...current,
                evaluation: parseEvalInput(event.target.value),
              }))
            }
            placeholder="+0.40"
            aria-label="What I think the position is worth, from White's side"
            className={`${INPUT} w-28 font-mono`}
          />
        </label>

        <label className="flex flex-col gap-1.5 flex-1 min-w-[16rem]">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            of the position after
          </span>
          <input
            value={log.line}
            onChange={event =>
              onChange(current => ({ ...current, line: event.target.value }))
            }
            placeholder="Nd5 Bxe7 Qxe7 — the line the number is the value of"
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Minutes</span>
          <input
            defaultValue={log.minutes === undefined ? '' : String(log.minutes)}
            key={`minutes-${log.ply}`}
            onBlur={event => {
              const value = Number(event.target.value.trim())
              onChange(current => {
                const next = { ...current }
                if (event.target.value.trim().length === 0 || !Number.isFinite(value)) {
                  delete next.minutes
                } else {
                  next.minutes = Math.max(0, Math.round(value))
                }
                return next
              })
            }}
            placeholder="12"
            className={`${INPUT} w-20`}
          />
          </label>
          </div>
        </>
      )}

      {passes.map(pass => (
        <div key={pass.id} className={`border-l-2 ${pass.border} pl-4 flex flex-col gap-3`}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-xs font-mono ${pass.tone}`}>Pass {pass.number}</span>
            <span className="text-sm font-semibold text-zinc-100">{pass.title}</span>
          </div>

          {pass.steps.map(step => (
            <div key={step.id} className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-300" htmlFor={`${log.ply}-${step.id}`}>
                {step.label}
              </label>
              <textarea
                id={`${log.ply}-${step.id}`}
                value={log.answers[step.id] ?? ''}
                onChange={event => setAnswer(step.id, event.target.value)}
                rows={step.checklist ? 3 : 2}
                placeholder={step.prompt}
                className={`${INPUT} resize-y`}
              />
              {step.checklist && (
                <p className="text-[11px] text-zinc-600">{step.checklist.join(' · ')}</p>
              )}
            </div>
          ))}

          {/*
            The book gate, at the foot of Pass 0 where it is answered. It is terminal:
            a move your preparation decided takes the burger and the plan off the form
            entirely, leaving the line you are in and the check that it still survives
            their reply.
          */}
          {pass.id === 'book' && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-xs text-zinc-500">Still in your preparation?</span>
              <Chip
                active
                onClick={() => onBook(false)}
                title="Still book — the burger and the plan are not asked"
              >
                yes
              </Chip>
              <Chip
                active={false}
                onClick={() => onBook(true)}
                title="This is the move your preparation ran out at"
              >
                no, it runs out here
              </Chip>
            </div>
          )}

          {/*
            The gate is drawn at the foot of Pass 1, where it is answered: the candidates
            are directly above it and the answer decides whether Pass 2 follows.
          */}
          {pass.id === 'burger' && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-xs text-zinc-500">
                Anything concrete that survives their best reply?
              </span>
              <Chip
                active={log.concrete}
                onClick={() => onChange(current => ({ ...current, concrete: true }))}
                title="Something concrete turned up — the plan pass is not asked"
              >
                yes
              </Chip>
              <Chip
                active={!log.concrete}
                onClick={() => onChange(current => ({ ...current, concrete: false }))}
                title="Quiet — the plan pass is asked"
              >
                no, it is quiet
              </Chip>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
