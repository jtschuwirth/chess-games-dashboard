'use client'

import { useEffect, useMemo, useState } from 'react'
import Chip from '@/components/Chip'
import { parseProposedMoves, plyLabel, sanFromUci, type Ply } from '@/lib/board'
import { REVIEW_DEPTH } from '@/lib/analysis'
import { analyzePosition, terminateEngine } from '@/lib/engine'
import { deleteReview, saveReview } from '@/lib/firestore'
import {
  MAX_REVIEW_MISTAKES,
  TAG_GROUPS,
  candidateMoves,
  formatCp,
  missingFrom,
} from '@/lib/review'
import type { GameRecord, GameReview, ReviewedMistake } from '@/types/chess'

const TAG_COLOR: Record<string, string> = {
  '??': 'text-red-400',
  '?': 'text-amber-400',
}

/** An entry being written. `better` stays raw text until it is parsed on save. */
interface Draft {
  ply: number
  san: string
  moveNumber: number
  cause: string
  signal: string
  better: string
  tags: string[]
  unreasonable: boolean
  cpBefore: number | null
  cpAfter: number | null
}

function draftFrom(mistake: ReviewedMistake): Draft {
  return {
    ply: mistake.ply,
    san: mistake.san,
    moveNumber: mistake.moveNumber,
    cause: mistake.cause,
    signal: mistake.signal,
    better: mistake.betterMoves.join(', '),
    tags: mistake.tags,
    unreasonable: mistake.unreasonable,
    cpBefore: mistake.cpBefore,
    cpAfter: mistake.cpAfter,
  }
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-zinc-300">{children}</span>
      {hint && <span className="text-xs text-zinc-600">{hint}</span>}
    </div>
  )
}

const FIELD =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/**
 * Root-cause analysis of one game: pick the moves that decided it, say why each went
 * wrong, what was there to see, and what you would play instead. The tags are what
 * accumulate — one game's review is a note, two hundred of them are a training plan.
 */
export default function ReviewEditor({
  userId,
  game,
  plies,
  suggestedTags,
  onShowPly,
  onSaved,
}: {
  userId: string
  game: GameRecord
  plies: Ply[]
  /** Tags you have invented in other reviews, offered back for consistency. */
  suggestedTags: string[]
  /** Puts the board on a move, so an entry and the position stay together. */
  onShowPly: (ply: number) => void
  onSaved: (review: GameReview | null) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    (game.review?.mistakes ?? []).map(draftFrom),
  )
  const [notes, setNotes] = useState(game.review?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<number | null>(game.review?.reviewedAt ?? null)
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<Record<number, string>>({})
  const [asking, setAsking] = useState<number | null>(null)

  /** The worker holds a few megabytes of wasm; nothing needs it once you leave. */
  useEffect(() => () => terminateEngine(), [])

  const plyByIndex = useMemo(() => new Map(plies.map(ply => [ply.index, ply])), [plies])
  const yourPlies = useMemo(
    () => plies.filter(ply => ply.color === game.color),
    [plies, game.color],
  )

  const taken = new Set(drafts.map(draft => draft.ply))
  const candidates = candidateMoves(game.analysis).filter(move => !taken.has(move.ply))
  const full = drafts.length >= MAX_REVIEW_MISTAKES

  function add(ply: number, cpBefore: number | null = null, cpAfter: number | null = null) {
    const move = plyByIndex.get(ply)
    if (!move || taken.has(ply) || full) return

    setSaved(null)
    setDrafts(prev =>
      [
        ...prev,
        {
          ply,
          san: move.san,
          moveNumber: move.moveNumber,
          cause: '',
          signal: '',
          better: '',
          tags: [],
          unreasonable: false,
          cpBefore,
          cpAfter,
        },
      ].sort((a, b) => a.ply - b.ply),
    )
    onShowPly(ply)
  }

  function patch(ply: number, changes: Partial<Draft>) {
    setSaved(null)
    setDrafts(prev => prev.map(draft => (draft.ply === ply ? { ...draft, ...changes } : draft)))
  }

  /** The engine's own answer, on demand — after you have committed to yours. */
  async function ask(ply: number) {
    const move = plyByIndex.get(ply)
    if (!move) return

    setAsking(ply)
    setError(null)
    try {
      const evaluation = await analyzePosition(move.fenBefore, REVIEW_DEPTH)
      const san = sanFromUci(move.fenBefore, evaluation.bestMoveUci)
      setEngine(prev => ({
        ...prev,
        [ply]: `${san ?? evaluation.bestMoveUci} (${formatCp(evaluation.cp)})`,
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The engine did not answer.')
    } finally {
      setAsking(null)
    }
  }

  const problems = drafts
    .map(draft => {
      const missing = missingFrom(toMistake(draft))
      return missing ? `${plyLabel(draft.ply, draft.san)}: ${missing}` : null
    })
    .filter((text): text is string => text !== null)

  function toMistake(draft: Draft): ReviewedMistake {
    const move = plyByIndex.get(draft.ply)
    const proposed = move ? parseProposedMoves(move.fenBefore, draft.better) : []

    return {
      ply: draft.ply,
      san: draft.san,
      moveNumber: draft.moveNumber,
      cause: draft.cause.trim(),
      signal: draft.signal.trim(),
      // only legal moves are stored; the illegal ones are flagged in the form instead
      betterMoves: proposed
        .map(entry => entry.san)
        .filter((san): san is string => san !== null),
      tags: draft.tags,
      unreasonable: draft.unreasonable,
      cpBefore: draft.cpBefore,
      cpAfter: draft.cpAfter,
    }
  }

  async function save() {
    if (problems.length > 0) return

    setSaving(true)
    setError(null)
    try {
      const review = await saveReview(userId, game.id, {
        mistakes: drafts.map(toMistake),
        notes: notes.trim(),
      })
      setSaved(review.reviewedAt)
      onSaved(review)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the review.')
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    setSaving(true)
    setError(null)
    try {
      await deleteReview(userId, game.id)
      setDrafts([])
      setNotes('')
      setSaved(null)
      onSaved(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not clear the review.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-sm">Root cause analysis</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Up to {MAX_REVIEW_MISTAKES} moves per game. Naming every slip explains nothing — pick
          the ones that decided it, then say why each happened. The tags build up into your
          record of what keeps going wrong.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label hint={game.analysis ? undefined : 'Run the engine above to get suggestions.'}>
          Moves to take apart
        </Label>

        <div className="flex gap-1.5 flex-wrap items-center">
          {candidates.map(move => (
            <button
              key={move.ply}
              type="button"
              disabled={full}
              onClick={() => add(move.ply, move.cpBefore, move.cpAfter)}
              title={`${formatCp(move.cpBefore)} → ${formatCp(move.cpAfter)}`}
              className="px-3 py-1 text-xs rounded-full border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-mono"
            >
              {plyLabel(move.ply, move.san)}
              <span className={TAG_COLOR[move.tag] ?? 'text-zinc-500'}> {move.tag}</span>
              <span className="text-zinc-500"> {formatCp(move.cpAfter)}</span>
            </button>
          ))}

          <select
            value=""
            disabled={full}
            onChange={event => {
              if (event.target.value) add(Number(event.target.value))
            }}
            className="bg-zinc-950 border border-zinc-800 rounded-full px-3 py-1 text-xs text-zinc-400 outline-none focus:border-zinc-600 disabled:opacity-40"
          >
            <option value="">+ another move…</option>
            {yourPlies
              .filter(ply => !taken.has(ply.index))
              .map(ply => (
                <option key={ply.index} value={ply.index}>
                  {plyLabel(ply.index, ply.san)}
                </option>
              ))}
          </select>

          {full && (
            <span className="text-xs text-zinc-600">
              {MAX_REVIEW_MISTAKES} is the limit — remove one to swap it out.
            </span>
          )}
        </div>
      </div>

      {drafts.map(draft => {
        const move = plyByIndex.get(draft.ply)
        const proposed = move ? parseProposedMoves(move.fenBefore, draft.better) : []
        const illegal = proposed.filter(entry => entry.san === null)

        return (
          <div
            key={draft.ply}
            className="border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 bg-zinc-950/40"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => onShowPly(draft.ply)}
                className="font-mono text-sm text-zinc-100 hover:text-white underline decoration-zinc-700 hover:decoration-zinc-400 transition-colors"
                title="Show this position on the board"
              >
                {plyLabel(draft.ply, draft.san)}
              </button>
              {draft.cpBefore !== null && (
                <span className="text-xs text-zinc-500 font-mono">
                  {formatCp(draft.cpBefore)} → {formatCp(draft.cpAfter)}
                </span>
              )}
              <button
                type="button"
                onClick={() => setDrafts(prev => prev.filter(entry => entry.ply !== draft.ply))}
                className="ml-auto text-xs text-zinc-500 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>

            <label className="flex items-start gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.unreasonable}
                onChange={event => patch(draft.ply, { unreasonable: event.target.checked })}
                className="mt-0.5 accent-zinc-400"
              />
              <span>
                Beyond what I could be expected to find
                <span className="block text-zinc-600">
                  The engine is right and there was no realistic way to see it. Kept on record,
                  left out of the tag counts — there is no pattern to train.
                </span>
              </span>
            </label>

            {!draft.unreasonable && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label hint="What does the move actually give away?">
                    Why was this a mistake?
                  </Label>
                  <textarea
                    value={draft.cause}
                    onChange={event => patch(draft.ply, { cause: event.target.value })}
                    rows={2}
                    placeholder="It drops the h-pawn and opens a file at my king…"
                    className={`${FIELD} resize-y`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label hint="The feature in the position that should have redirected you.">
                    What was there to see?
                  </Label>
                  <textarea
                    value={draft.signal}
                    onChange={event => patch(draft.ply, { signal: event.target.value })}
                    rows={2}
                    placeholder="Their rook was already on the open file, so any pawn move there needed a check…"
                    className={`${FIELD} resize-y`}
                  />
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <Label hint="Not the engine's best — anything that holds the game. Separate with commas.">
                What would you play instead?
              </Label>
              <input
                value={draft.better}
                onChange={event => patch(draft.ply, { better: event.target.value })}
                placeholder="Kb7, Rc8"
                className={`${FIELD} font-mono`}
              />
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {proposed
                  .filter(entry => entry.san !== null)
                  .map((entry, index) => (
                    <span key={index} className="text-emerald-400 font-mono">
                      ✓ {entry.san}
                    </span>
                  ))}
                {illegal.length > 0 && (
                  <span className="text-red-400">
                    not legal here: {illegal.map(entry => entry.input).join(', ')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => ask(draft.ply)}
                  disabled={asking !== null}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
                >
                  {asking === draft.ply ? 'asking the engine…' : "engine's choice"}
                </button>
                {engine[draft.ply] && (
                  <span className="text-sky-300 font-mono">{engine[draft.ply]}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label hint="This is the part that adds up across games.">Tags</Label>

              <div className="flex gap-1.5 flex-wrap">
                {draft.tags.length === 0 && (
                  <span className="text-xs text-zinc-600">Nothing tagged yet.</span>
                )}
                {draft.tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      patch(draft.ply, { tags: draft.tags.filter(entry => entry !== tag) })
                    }
                    className="px-2.5 py-1 text-xs rounded-full bg-zinc-200 text-zinc-900 hover:bg-white transition-colors"
                    title="Remove this tag"
                  >
                    {tag} ✕
                  </button>
                ))}
              </div>

              <details open={draft.tags.length === 0} className="group">
                <summary className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors">
                  Pick tags
                </summary>

                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  {TAG_GROUPS.map(group => (
                    <div key={group.name} className="flex flex-col gap-1.5">
                      <span className="text-xs uppercase tracking-wide text-zinc-500">
                        {group.name}
                        <span className="normal-case tracking-normal text-zinc-700">
                          {' '}
                          — {group.hint}
                        </span>
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {group.tags.map(tag => (
                          <Chip
                            key={tag}
                            active={draft.tags.includes(tag)}
                            onClick={() =>
                              patch(draft.ply, {
                                tags: draft.tags.includes(tag)
                                  ? draft.tags.filter(entry => entry !== tag)
                                  : [...draft.tags, tag],
                              })
                            }
                          >
                            {tag}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs uppercase tracking-wide text-zinc-500">Your own</span>
                    <div className="flex gap-1 flex-wrap">
                      {suggestedTags.map(tag => (
                        <Chip
                          key={tag}
                          active={draft.tags.includes(tag)}
                          onClick={() =>
                            patch(draft.ply, {
                              tags: draft.tags.includes(tag)
                                ? draft.tags.filter(entry => entry !== tag)
                                : [...draft.tags, tag],
                            })
                          }
                        >
                          {tag}
                        </Chip>
                      ))}
                    </div>
                    <input
                      placeholder="add a tag and press Enter"
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()

                        const value = event.currentTarget.value.trim().toLowerCase()
                        if (value.length === 0 || draft.tags.includes(value)) return

                        patch(draft.ply, { tags: [...draft.tags, value] })
                        event.currentTarget.value = ''
                      }}
                      className={`${FIELD} text-xs`}
                    />
                  </div>
                </div>
              </details>
            </div>
          </div>
        )
      })}

      {drafts.length === 0 && (
        <p className="text-sm text-zinc-500">
          Pick a move above to start. The engine&apos;s own objections are offered first, worst
          loss leading.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label hint="Optional — the thread running through the whole game.">Game notes</Label>
        <textarea
          value={notes}
          onChange={event => {
            setSaved(null)
            setNotes(event.target.value)
          }}
          rows={2}
          placeholder="Comfortable until the time scramble, then I stopped looking at their threats."
          className={`${FIELD} resize-y`}
        />
      </div>

      {problems.length > 0 && (
        <ul className="text-xs text-amber-400 flex flex-col gap-0.5">
          {problems.map(problem => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={save}
          disabled={saving || drafts.length === 0 || problems.length > 0}
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save review'}
        </button>

        {game.review && (
          <button
            onClick={clear}
            disabled={saving}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            Delete review
          </button>
        )}

        {saved && (
          <span className="text-xs text-zinc-600">
            Reviewed {new Date(saved).toLocaleString()}
          </span>
        )}
      </div>
    </section>
  )
}
