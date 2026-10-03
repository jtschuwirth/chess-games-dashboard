'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Chip from '@/components/Chip'
import { playMove, plyLabel, sanFromUci, type Ply } from '@/lib/board'
import { REVIEW_DEPTH, classifyMove, type MoveTag } from '@/lib/analysis'
import { analyzePosition, terminateEngine } from '@/lib/engine'
import { deleteReview, saveReview } from '@/lib/firestore'
import {
  MAX_REVIEW_MISTAKES,
  TAG_GROUPS,
  betterMovesOf,
  candidateMoves,
  formatEval,
  isFault,
  missingFrom,
} from '@/lib/review'
import type { GameRecord, GameReview, ProposedMove, ReviewedMistake } from '@/types/chess'

const TAG_COLOR: Record<string, string> = {
  '??': 'text-red-400',
  '?': 'text-amber-400',
}

/** How a proposed move turned out when the engine looked at it. */
type Verdict = { cpBefore: number; cpAfter: number; tag: MoveTag } | 'failed'

/** How long to sit still before spending engine time on what you are still typing. */
const CHECK_DELAY = 700

/** A move being proposed. `input` is what you typed; its SAN is resolved as you type. */
interface ProposedRow {
  input: string
  why: string
}

const EMPTY_ROW: ProposedRow = { input: '', why: '' }

interface Draft {
  ply: number
  san: string
  moveNumber: number
  cause: string
  signal: string
  better: ProposedRow[]
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
    better: betterMovesOf(mistake).map(move => ({ input: move.san, why: move.why })),
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
  /** Keyed by `ply:san`, so a move retyped or proposed twice is only judged once. */
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const requested = useRef(new Set<string>())

  /**
   * Whether each entry's tag picker is open, held per entry rather than derived from
   * whether it has tags yet: derived, picking the first tag closed the picker under
   * you, and tagging a move usually takes more than one.
   */
  const [tagsOpen, setTagsOpen] = useState<Record<number, boolean>>(() =>
    Object.fromEntries((game.review?.mistakes ?? []).map(entry => [entry.ply, entry.tags.length === 0])),
  )

  /** The worker holds a few megabytes of wasm; nothing needs it once you leave. */
  useEffect(() => () => terminateEngine(), [])

  const plyByIndex = useMemo(() => new Map(plies.map(ply => [ply.index, ply])), [plies])
  const yourPlies = useMemo(
    () => plies.filter(ply => ply.color === game.color),
    [plies, game.color],
  )

  /** Each legal alternative on screen, with the two positions needed to judge it. */
  const alternatives = useMemo(
    () =>
      drafts.flatMap(draft => {
        const move = plyByIndex.get(draft.ply)
        if (!move) return []

        return draft.better.flatMap(row => {
          const played = playMove(move.fenBefore, row.input)
          if (!played) return []
          return [
            {
              key: `${draft.ply}:${played.san}`,
              fenBefore: move.fenBefore,
              fenAfter: played.fen,
            },
          ]
        })
      }),
    [drafts, plyByIndex],
  )

  /**
   * Judges each alternative by the same rule as the move you played: evaluate the
   * position before and the one your move leads to, at one depth so the two numbers
   * are comparable, then classify the swing. An idea that answers a blunder with
   * another blunder is worth knowing about before you write it down as the lesson.
   *
   * Debounced, because the list changes on every keystroke, and keyed so a move is
   * only ever judged once — the engine caches positions by FEN on top of that.
   */
  useEffect(() => {
    const pending = alternatives.filter(entry => !requested.current.has(entry.key))
    if (pending.length === 0) return

    let cancelled = false
    const timer = setTimeout(async () => {
      for (const entry of pending) {
        if (cancelled) return
        requested.current.add(entry.key)

        try {
          const before = await analyzePosition(entry.fenBefore, REVIEW_DEPTH)
          const after = await analyzePosition(entry.fenAfter, REVIEW_DEPTH)
          if (cancelled) return

          const cpBefore = before.cp
          // scored for your opponent, who is to move after your alternative
          const cpAfter = -after.cp
          setVerdicts(prev => ({
            ...prev,
            [entry.key]: { cpBefore, cpAfter, tag: classifyMove(cpBefore, cpAfter, false) },
          }))
        } catch {
          // the engine was stopped, or the tab is going away — allow a later retry
          requested.current.delete(entry.key)
          if (!cancelled) setVerdicts(prev => ({ ...prev, [entry.key]: 'failed' }))
        }
      }
    }, CHECK_DELAY)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [alternatives])

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
          better: [EMPTY_ROW],
          tags: [],
          unreasonable: false,
          cpBefore,
          cpAfter,
        },
      ].sort((a, b) => a.ply - b.ply),
    )
    setTagsOpen(prev => ({ ...prev, [ply]: true }))
    onShowPly(ply)
  }

  function patch(ply: number, changes: Partial<Draft>) {
    setSaved(null)
    setDrafts(prev => prev.map(draft => (draft.ply === ply ? { ...draft, ...changes } : draft)))
  }

  function setRow(draft: Draft, index: number, changes: Partial<ProposedRow>) {
    patch(draft.ply, {
      better: draft.better.map((row, at) => (at === index ? { ...row, ...changes } : row)),
    })
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
        // scored for the side to move, which at a position before your move is you
        [ply]: `${san ?? evaluation.bestMoveUci} (${formatEval(evaluation.cp, game.color)})`,
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

    // only legal moves are stored; the illegal ones are flagged in the form instead
    const betterMoves: ProposedMove[] = []
    for (const row of draft.better) {
      const played = move ? playMove(move.fenBefore, row.input) : null
      if (played) betterMoves.push({ san: played.san, why: row.why.trim() })
    }

    return {
      ply: draft.ply,
      san: draft.san,
      moveNumber: draft.moveNumber,
      cause: draft.cause.trim(),
      signal: draft.signal.trim(),
      betterMoves,
      tags: draft.tags,
      unreasonable: draft.unreasonable,
      cpBefore: draft.cpBefore,
      cpAfter: draft.cpAfter,
    }
  }

  /** Entries, or a note on a game that did not need any. Never an empty document. */
  const saveable = drafts.length > 0 || notes.trim().length > 0

  async function save() {
    if (problems.length > 0 || !saveable) return

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
              title={`${formatEval(move.cpBefore, game.color)} → ${formatEval(
                move.cpAfter,
                game.color,
              )}`}
              className="px-3 py-1 text-xs rounded-full border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-mono"
            >
              {plyLabel(move.ply, move.san)}
              <span className={TAG_COLOR[move.tag] ?? 'text-zinc-500'}> {move.tag}</span>
              <span className="text-zinc-500"> {formatEval(move.cpAfter, game.color)}</span>
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
                <span
                  className="text-xs text-zinc-500 font-mono"
                  title="From White's side, the way a board shows it"
                >
                  {formatEval(draft.cpBefore, game.color)} →{' '}
                  {formatEval(draft.cpAfter, game.color)}
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
                    rows={4}
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
                    rows={4}
                    placeholder="Their rook was already on the open file, so any pawn move there needed a check…"
                    className={`${FIELD} resize-y`}
                  />
                </div>
              </>
            )}

            <div className="flex flex-col gap-2">
              <Label hint="Not the engine's best — anything that holds the game, and what makes it hold.">
                What would you play instead?
              </Label>

              {draft.better.map((row, index) => {
                const played = move ? playMove(move.fenBefore, row.input) : null
                const illegal = row.input.trim().length > 0 && played === null
                const verdict = played ? verdicts[`${draft.ply}:${played.san}`] : undefined

                return (
                  <div key={index} className="flex flex-col sm:flex-row gap-2 items-start">
                    <div className="flex flex-col gap-1 w-full sm:w-36 shrink-0">
                      <input
                        value={row.input}
                        onChange={event => setRow(draft, index, { input: event.target.value })}
                        placeholder="Nd5"
                        aria-label="Move"
                        className={`${FIELD} font-mono ${illegal ? 'border-red-500/60' : ''}`}
                      />
                      {played && (
                        <span className="text-xs text-zinc-500 font-mono">✓ {played.san}</span>
                      )}
                      {illegal && <span className="text-xs text-red-400">not legal here</span>}

                      {played &&
                        (verdict === undefined ? (
                          <span className="text-xs text-zinc-600">checking…</span>
                        ) : verdict === 'failed' ? (
                          <span className="text-xs text-zinc-600">not checked</span>
                        ) : (
                          <span
                            className={`text-xs font-mono ${
                              TAG_COLOR[verdict.tag] ?? 'text-emerald-400'
                            }`}
                            title={
                              isFault(verdict.tag)
                                ? 'Your alternative gives something away too'
                                : 'Your alternative holds the position'
                            }
                          >
                            {formatEval(verdict.cpBefore, game.color)} →{' '}
                            {formatEval(verdict.cpAfter, game.color)}
                            {isFault(verdict.tag) && ` ${verdict.tag}`}
                          </span>
                        ))}
                    </div>

                    <textarea
                      value={row.why}
                      onChange={event => setRow(draft, index, { why: event.target.value })}
                      rows={2}
                      aria-label="Why this move"
                      placeholder="Holds f6 and keeps the h-file shut, so the queen has nothing to come to."
                      className={`${FIELD} flex-1 w-full resize-y`}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        patch(draft.ply, {
                          better: draft.better.filter((entry, at) => at !== index),
                        })
                      }
                      title="Remove this move"
                      aria-label="Remove this move"
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors px-1 py-2 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}

              <div className="flex items-center gap-3 flex-wrap text-xs">
                <button
                  type="button"
                  onClick={() => patch(draft.ply, { better: [...draft.better, EMPTY_ROW] })}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  + another move
                </button>
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

              {/*
                A plain button rather than <details>: React nulls `currentTarget` on a
                toggle event, and reading it there crashed the page.
              */}
              <button
                type="button"
                onClick={() =>
                  setTagsOpen(prev => ({ ...prev, [draft.ply]: !(prev[draft.ply] ?? true) }))
                }
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors self-start"
              >
                {(tagsOpen[draft.ply] ?? true) ? '▾ Hide tags' : '▸ Pick tags'}
              </button>

              {(tagsOpen[draft.ply] ?? true) && (
                <div className="grid sm:grid-cols-2 gap-3">
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
              )}
            </div>
          </div>
        )
      })}

      {drafts.length === 0 && (
        <p className="text-sm text-zinc-500">
          Pick a move above to start — the engine&apos;s own objections are offered first, worst
          loss leading. Nothing to pick apart? Leave a note below and save; the game counts as
          reviewed either way.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label
          hint={
            drafts.length === 0
              ? 'On its own this marks the game reviewed, for one that needed no post-mortem.'
              : 'Optional — the thread running through the whole game.'
          }
        >
          Game notes
        </Label>
        <textarea
          value={notes}
          onChange={event => {
            setSaved(null)
            setNotes(event.target.value)
          }}
          rows={3}
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
          disabled={saving || !saveable || problems.length > 0}
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
