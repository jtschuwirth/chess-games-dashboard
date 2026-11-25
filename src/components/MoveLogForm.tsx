'use client'

import Chip from '@/components/Chip'
import { FilterGrid, FilterRow } from '@/components/FilterPanel'
import {
  formatEvalGuess,
  parseEvalInput,
  passesFor,
  TECHNIQUE_POINTS,
  techniqueLead,
  withVerdict,
} from '@/lib/daily'
import { COLOR_LABEL, type Color, type MoveLog, type MoveStepId, type TechniqueVerdict } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

const VERDICTS: { verdict: TechniqueVerdict; label: string }[] = [
  { verdict: 'white', label: 'White' },
  { verdict: 'equal', label: 'equal' },
  { verdict: 'black', label: 'Black' },
]

/**
 * The loop as a form: what you write before playing one move.
 *
 * It renders the same `METHOD_PASSES` table the method page draws, so the questions
 * cannot differ between the screen that teaches the procedure and the screen that asks
 * it of you — and a fifth question arrives in both at once.
 *
 * **The gate is a control rather than a note**, and it is what makes filling this in
 * the same act as running the method: answering *yes, something concrete* takes the
 * evaluation pass off the form, because there was nothing quiet to evaluate. Answering
 * *no* puts it back.
 *
 * **The evaluation is asked last, at the head of Pass 3.** It sat at the top of the form,
 * which asked for a number before anything had been read — and a number written first is
 * a guess the reading then has to argue with. It comes after either branch, once the
 * position has been taken apart, and before the blunder check, which is about the move
 * rather than the position.
 */
export default function MoveLogForm({
  log,
  color,
  inBook,
  onBook,
  onChange,
}: {
  log: MoveLog
  /** Your side, so the technique can say which lead is yours to press. */
  color: Color
  /** Whether your preparation still covers this move. */
  inBook: boolean
  /** Move the end of the book to this move, or past it. */
  onBook: (out: boolean) => void
  onChange: (update: (current: MoveLog) => MoveLog) => void
}) {
  const passes = passesFor(log.concrete, inBook)
  const mine = techniqueLead(log.technique, color)
  const theirs = techniqueLead(log.technique, color === 'white' ? 'black' : 'white')

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

  /** The five points as rows of chips, and what they add up to under them. */
  function renderTechnique() {
    return (
      <div className="flex flex-col gap-2">
        <FilterGrid>
          {TECHNIQUE_POINTS.map((point, index) => (
            <FilterRow key={point.id} label={`${index + 1}. ${point.label}`}>
              {VERDICTS.map(({ verdict, label }) => (
                <Chip
                  key={verdict}
                  active={log.technique?.[point.id] === verdict}
                  onClick={() => onChange(current => withVerdict(current, point.id, verdict))}
                >
                  {label}
                </Chip>
              ))}
            </FilterRow>
          ))}
        </FilterGrid>

        {/*
          The hierarchy's answer, derived rather than asked: the highest point you lead on
          is what you play for, and the highest point they lead on is what you must not
          let grow. Saying it here is what makes pressing the chips the same act as
          deciding the plan.
        */}
        {(mine || theirs) && (
          <p className="text-xs text-zinc-400">
            {mine ? (
              <>
                Play for{' '}
                <span className="text-emerald-300 font-semibold">
                  {mine.point.label.toLowerCase()}
                </span>
              </>
            ) : (
              'No lead of yours yet'
            )}
            {theirs && (
              <>
                {' · '}keep {COLOR_LABEL[theirs.side]}&rsquo;s{' '}
                <span className="text-rose-300">{theirs.point.label.toLowerCase()}</span>{' '}
                from growing
              </>
            )}
          </p>
        )}
      </div>
    )
  }

  /** The number and the line it is the value of — asked once the reading is done. */
  function renderEvaluation() {
    return (
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span
            className="text-xs text-zinc-300"
            title="From White's side, which is the frame every board and engine reading in the app shows"
          >
            What is it worth?
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
          <span className="text-xs text-zinc-300">of the position after</span>
          <input
            value={log.line}
            onChange={event => onChange(current => ({ ...current, line: event.target.value }))}
            placeholder="Nd5 Bxe7 Qxe7 — the line the number is the value of"
            className={INPUT}
          />
        </label>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        Out of book, the fact is a line rather than a control: it is true of the whole
        rest of the game and you are not deciding it again on every move. It stays
        pressable because a mispress has to be undoable from the move it was made on.
      */}
      {!inBook && (
        <div className="flex flex-wrap items-end justify-between gap-4">
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

          <label className="flex items-center gap-2">
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
      )}

      {passes.map(pass => (
        <div key={pass.id} className={`border-l-2 ${pass.border} pl-4 flex flex-col gap-3`}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-xs font-mono ${pass.tone}`}>Pass {pass.number}</span>
            <span className="text-sm font-semibold text-zinc-100">{pass.title}</span>
          </div>

          {/*
            Not in book: there you are recalling a move rather than judging a position,
            and a number written to fill a box would be scored by the post-mortem as an
            opinion you never held.
          */}
          {pass.evaluates && !inBook && renderEvaluation()}

          {pass.steps.map(step => (
            <div key={step.id} className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-300" htmlFor={`${log.ply}-${step.id}`}>
                {step.label}
              </label>
              {step.id === 'technique' && renderTechnique()}
              <textarea
                id={`${log.ply}-${step.id}`}
                value={log.answers[step.id] ?? ''}
                onChange={event => setAnswer(step.id, event.target.value)}
                rows={step.id === 'technique' ? 2 : step.checklist ? 3 : 2}
                placeholder={step.prompt}
                className={`${INPUT} resize-y`}
              />
              {/* the technique's checklist is the five rows above it */}
              {step.checklist && step.id !== 'technique' && (
                <p className="text-[11px] text-zinc-600">{step.checklist.join(' · ')}</p>
              )}
            </div>
          ))}

          {/*
            The book gate, at the foot of Pass 0 where it is answered. It is terminal:
            a move your preparation decided takes the burger and the evaluation off the
            form entirely, leaving the line you are in and the check that it still
            survives their reply.
          */}
          {pass.id === 'book' && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-xs text-zinc-500">Still in your preparation?</span>
              <Chip
                active
                onClick={() => onBook(false)}
                title="Still book — the burger and the evaluation are not asked"
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
                title="Something concrete turned up — the evaluation pass is not asked"
              >
                yes
              </Chip>
              <Chip
                active={!log.concrete}
                onClick={() => onChange(current => ({ ...current, concrete: false }))}
                title="Quiet — the evaluation pass is asked"
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
