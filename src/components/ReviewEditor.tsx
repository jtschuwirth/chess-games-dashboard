'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import MoveNoteCard, { type NoteDraft } from '@/components/MoveNoteCard'
import ProposedMoves, {
  EMPTY_ROW,
  verdictKey,
  type ProposedRow,
  type Verdict,
} from '@/components/ProposedMoves'
import TagPicker from '@/components/TagPicker'
import { parseLine, plyLabel, sanFromUci, type Ply } from '@/lib/board'
import { ENGINE_DEPTH, classifyMove } from '@/lib/analysis'
import { analyzePosition, terminateEngine } from '@/lib/engine'
import { deleteReview, saveReview } from '@/lib/firestore'
import {
  MAX_REVIEW_MISTAKES,
  repeatsOf,
  betterMovesOf,
  candidateMoves,
  formatEval,
  fromMover,
  markColor,
  missingFrom,
  moveNotesOf,
  noteHasContent,
} from '@/lib/review'
import { tagName, type TagGroup } from '@/lib/tags'
import type {
  GameRecord,
  GameReview,
  MistakeRepeat,
  MoveNote,
  ProposedMove,
  ReviewedMistake,
} from '@/types/chess'

/** How long to sit still before spending engine time on what you are still typing. */
const CHECK_DELAY = 700

/** A note loaded from a saved review, in the shape the form edits. */
function noteDraftFrom(note: MoveNote): NoteDraft {
  return {
    ply: note.ply,
    san: note.san,
    moveNumber: note.moveNumber,
    note: note.note,
    tags: note.tags,
    lines: (note.alternatives ?? []).map(move => ({
      input: move.line.join(' '),
      why: move.why,
    })),
    cpBefore: note.cpBefore,
    cpAfter: note.cpAfter,
  }
}

interface Draft {
  ply: number
  san: string
  moveNumber: number
  /** Other moves this entry covers: you made this same mistake there too. */
  repeats: MistakeRepeat[]
  intent: string
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
    repeats: repeatsOf(mistake),
    intent: mistake.intent ?? '',
    cause: mistake.cause,
    signal: mistake.signal,
    better: betterMovesOf(mistake).map(move => ({ input: move.line.join(' '), why: move.why })),
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
/**
 * One half of the review, set off from the other.
 *
 * The form held both halves in one column under a single **Root cause analysis**
 * heading, which named only half of what was in it. A post-mortem of the two or three
 * moves that decided the game and a pile of notes about moves that merely wanted
 * remembering are different kinds of writing — one answers four fixed questions and is
 * capped at three, the other asks nothing and has no limit — and running them together
 * in one list is what made the form hard to read and the heading a lie about its own
 * contents.
 *
 * A rule and a count rather than a box: a bordered box inside a bordered box reads as a
 * mistake, which is the panel rule the dashboard already follows. The count is in the
 * heading because it is the thing you look up to check — two of three taken apart, four
 * moves noted.
 */
function Group({
  title,
  line,
  meta,
  children,
}: {
  title: string
  /** What this half is for, in the words that tell it from the other half. */
  line: string
  meta: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 border-b border-zinc-800 pb-1.5">
        <h3 className="text-xs uppercase tracking-wide text-zinc-300 font-medium shrink-0">
          {title}
        </h3>
        <span className="text-xs text-zinc-600 min-w-0 truncate">{line}</span>
        <span className="text-xs text-zinc-500 ml-auto shrink-0 tabular-nums">{meta}</span>
      </div>
      {children}
    </section>
  )
}

export default function ReviewEditor({
  userId,
  game,
  plies,
  tagGroups,
  patternTags,
  onShowPly,
  lineOnBoard,
  onSaved,
}: {
  userId: string
  game: GameRecord
  plies: Ply[]
  /** Tags you have invented in other reviews, offered back for consistency. */
  tagGroups: TagGroup[]
  /**
   * Your written-up patterns, offered as tags. A pattern's name is its tag, so picking
   * one here is what connects "I should have played this" to the thing you wrote.
   */
  patternTags: string[]
  /** Puts the board on a move, so an entry and the position stay together. */
  onShowPly: (ply: number) => void
  /**
   * The line the board is standing on, counted from a given move — empty unless it is
   * out on a branch from exactly there. What lets an entry take a line you have
   * played out rather than asking you to read it off and type it back.
   */
  lineOnBoard?: (ply: number) => string[]
  onSaved: (review: GameReview | null) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    (game.review?.mistakes ?? []).map(draftFrom),
  )
  const [noteDrafts, setNoteDrafts] = useState<NoteDraft[]>(() =>
    moveNotesOf(game.review).map(noteDraftFrom),
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
    Object.fromEntries(
      [...(game.review?.mistakes ?? []), ...moveNotesOf(game.review)].map(entry => [
        entry.ply,
        entry.tags.length === 0,
      ]),
    ),
  )

  /**
   * Which entries are folded away. Three moves of questions, lines and tags is a long
   * form; collapsing the ones you have finished keeps the one you are working on in
   * view. Entries loaded from a saved review start folded, since they are already
   * written — a new one never does.
   */
  const [folded, setFolded] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(
      [...(game.review?.mistakes ?? []), ...moveNotesOf(game.review)].map(entry => [
        entry.ply,
        true,
      ]),
    ),
  )

  /** The worker holds a few megabytes of wasm; nothing needs it once you leave. */
  useEffect(() => () => terminateEngine(), [])

  const plyByIndex = useMemo(() => new Map(plies.map(ply => [ply.index, ply])), [plies])
  const yourPlies = useMemo(
    () => plies.filter(ply => ply.color === game.color),
    [plies, game.color],
  )

  /**
   * Each legal alternative on screen, plus the move you actually played, with the two
   * positions needed to judge each. The move you played is in here so its evaluation
   * comes from the same depth as everything beside it: the stored one was written by
   * whatever depth the batch run used, and two depths in one card cannot be compared.
   */
  const alternatives = useMemo(() => {
    /*
      One entry's worth: the move played, plus every legal line proposed under it. The
      two kinds of entry go through the same function because they are the same
      question — a note's lines are judged exactly as a mistake's are, and the verdict
      cache is keyed by `ply:san`, which cannot tell them apart and should not.
    */
    const forEntry = (ply: number, rows: ProposedRow[]) => {
      const move = plyByIndex.get(ply)
      if (!move) return []

      // whose move it is decides both the sign and whether there is a judgement to make
      const yours = move.color === game.color

      // only the first move of a line is a decision you get to make, so that is what
      // gets judged; the rest depends on the opponent playing along
      const lines = rows.flatMap(row => {
        const parsed = parseLine(move.fenBefore, row.input)
        if (parsed.line.length === 0) return []
        return [
          {
            key: verdictKey(ply, parsed.line[0]),
            fenBefore: move.fenBefore,
            fenAfter: parsed.fens[0],
            yours,
          },
        ]
      })

      // the before position is shared with every alternative, so this costs one lookup
      return [
        {
          key: verdictKey(ply, move.san),
          fenBefore: move.fenBefore,
          fenAfter: move.fenAfter,
          yours,
        },
        ...lines,
      ]
    }

    return [
      ...drafts.flatMap(draft => forEntry(draft.ply, draft.better)),
      ...noteDrafts.flatMap(draft => forEntry(draft.ply, draft.lines)),
    ]
  }, [drafts, noteDrafts, plyByIndex, game.color])

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
          const before = await analyzePosition(entry.fenBefore, ENGINE_DEPTH)
          const after = await analyzePosition(entry.fenAfter, ENGINE_DEPTH)
          // superseded by a later keystroke: hand the move back so the next run takes it,
          // or it sits on "checking…" forever having been marked as already requested
          if (cancelled) {
            requested.current.delete(entry.key)
            return
          }

          // both readings come back in the frame of whoever plays the ply; everything
          // downstream wants yours, so a move of theirs is flipped once, here
          const cpBefore = fromMover(before.cp, entry.yours)
          // scored for whoever is to move after the line, which is the other player
          const cpAfter = fromMover(-after.cp, entry.yours)

          setVerdicts(prev => ({
            ...prev,
            [entry.key]: {
              cpBefore,
              cpAfter,
              // a fault is a judgement about the player who made the move
              tag: entry.yours ? classifyMove(cpBefore, cpAfter, false) : null,
            },
          }))
        } catch {
          if (cancelled) {
            requested.current.delete(entry.key)
            return
          }
          // recorded rather than retried: a failing engine must not be asked again
          setVerdicts(prev => ({ ...prev, [entry.key]: 'failed' }))
        }
      }
    }, CHECK_DELAY)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [alternatives])

  /**
   * Every ply already spoken for: an entry of its own, somebody's repeat, or a note.
   * One move gets one entry, whichever kind — otherwise the same move could be both
   * taken apart and noted, and the two would disagree on the page.
   */
  const taken = new Set([
    ...drafts.flatMap(draft => [draft.ply, ...draft.repeats.map(repeat => repeat.ply)]),
    ...noteDrafts.map(draft => draft.ply),
  ])
  /** Marked moves nobody has claimed: what you can take apart, and what a repeat can be. */
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
          repeats: [],
          intent: '',
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
    setFolded(prev => ({ ...prev, [ply]: false }))
    onShowPly(ply)
  }

  /**
   * A move worth noting. No cap and no candidate list: the engine has no opinion about
   * which moves are worth remembering, which is rather the point of the other list.
   */
  function addNote(ply: number, cpBefore: number | null = null, cpAfter: number | null = null) {
    const move = plyByIndex.get(ply)
    if (!move || taken.has(ply)) return

    setSaved(null)
    setNoteDrafts(prev =>
      [
        ...prev,
        {
          ply,
          san: move.san,
          moveNumber: move.moveNumber,
          note: '',
          tags: [],
          lines: [EMPTY_ROW],
          cpBefore,
          cpAfter,
        },
      ].sort((a, b) => a.ply - b.ply),
    )
    setTagsOpen(prev => ({ ...prev, [ply]: false }))
    setFolded(prev => ({ ...prev, [ply]: false }))
    onShowPly(ply)
  }

  function patchNote(ply: number, changes: Partial<NoteDraft>) {
    setSaved(null)
    setNoteDrafts(prev =>
      prev.map(draft => (draft.ply === ply ? { ...draft, ...changes } : draft)),
    )
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
      const evaluation = await analyzePosition(move.fenBefore, ENGINE_DEPTH)
      const san = sanFromUci(move.fenBefore, evaluation.bestMoveUci)
      // scored for the side to move, which is you on your move and them on theirs
      const cp = fromMover(evaluation.cp, move.color === game.color)

      setEngine(prev => ({
        ...prev,
        [ply]: `${san ?? evaluation.bestMoveUci} (${formatEval(cp, game.color)})`,
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
    // only the legal prefix is stored; whatever stopped the parse is flagged in the form
    const betterMoves: ProposedMove[] = []
    for (const row of draft.better) {
      const parsed = move ? parseLine(move.fenBefore, row.input) : null
      if (parsed && parsed.line.length > 0) {
        betterMoves.push({ line: parsed.line, why: row.why.trim() })
      }
    }

    return {
      ply: draft.ply,
      san: draft.san,
      moveNumber: draft.moveNumber,
      // only when there are any: Firestore rejects a document carrying `undefined`, and
      // an empty array on every entry ever written is noise in the document
      ...(draft.repeats.length > 0 ? { repeats: draft.repeats } : {}),
      intent: draft.intent.trim(),
      cause: draft.cause.trim(),
      signal: draft.signal.trim(),
      betterMoves,
      tags: draft.tags,
      unreasonable: draft.unreasonable,
      cpBefore: draft.cpBefore,
      cpAfter: draft.cpAfter,
    }
  }

  function toMoveNote(draft: NoteDraft): MoveNote {
    const move = plyByIndex.get(draft.ply)

    // only the legal prefix is stored; whatever stopped the parse is flagged in the form
    const alternatives: ProposedMove[] = []
    for (const row of draft.lines) {
      const parsed = move ? parseLine(move.fenBefore, row.input) : null
      if (parsed && parsed.line.length > 0) {
        alternatives.push({ line: parsed.line, why: row.why.trim() })
      }
    }

    return {
      ply: draft.ply,
      san: draft.san,
      moveNumber: draft.moveNumber,
      note: draft.note.trim(),
      tags: draft.tags,
      alternatives,
      cpBefore: draft.cpBefore,
      cpAfter: draft.cpAfter,
    }
  }

  /**
   * A note you opened and left blank is dropped rather than refused. The mistake
   * entries block the save because a half-written post-mortem is wrong; a note with
   * nothing in it is just a note you decided against, and stopping the save over it
   * would be the form arguing with you.
   */
  const writtenNotes = noteDrafts.map(toMoveNote).filter(noteHasContent)

  /** Entries, notes, or a line about the game. Never an empty document. */
  const saveable = drafts.length > 0 || writtenNotes.length > 0 || notes.trim().length > 0

  async function save() {
    if (problems.length > 0 || !saveable) return

    setSaving(true)
    setError(null)
    try {
      const review = await saveReview(userId, game.id, {
        mistakes: drafts.map(toMistake),
        notes: notes.trim(),
        /*
          Always written, even empty — the one place this codebase's habit of omitting
          empties would be a bug. `saveReview` merges, and a merge deep-merges nested
          maps, so a `moveNotes` left out would leave the previous save's notes in the
          document and they would come back on the next read. Same trap as the pattern
          `main` field, reached from the other direction.
        */
        moveNotes: writtenNotes,
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
      setNoteDrafts([])
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
        <h2 className="font-semibold text-sm">Your review</h2>
      </div>

      <Group
        title="Root cause analysis"
        line="the moves that decided it, four questions each"
        meta={`${drafts.length} of ${MAX_REVIEW_MISTAKES}`}
      >
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
                title={`Take this move apart${
                  game.analysis ? ` — from the stored analysis at depth ${game.analysis.depth}` : ''
                }`}
                className="px-3 py-1 text-xs rounded-full border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-mono"
              >
                {plyLabel(move.ply, move.san)}
                <span className={markColor(move.tag)}> {move.tag}</span>
                {/* both ends: where the move left you is meaningless without where it started */}
                <span className="text-zinc-500">
                  {' '}
                  {formatEval(move.cpBefore, game.color)} → {formatEval(move.cpAfter, game.color)}
                </span>
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
              <option value="">+ another line…</option>
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

          // once the engine has looked at the move you played, show that rather than
          // whatever the stored analysis said, so the card is internally comparable
          const judged = verdicts[`${draft.ply}:${draft.san}`]
          const live = judged && judged !== 'failed' ? judged : null
          const shownBefore = live ? live.cpBefore : draft.cpBefore
          const shownAfter = live ? live.cpAfter : draft.cpAfter
          const isFolded = folded[draft.ply] ?? false

          return (
            <div
              key={draft.ply}
              className="border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 bg-zinc-950/40"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFolded(prev => ({ ...prev, [draft.ply]: !isFolded }))}
                  title={isFolded ? 'Open this move' : 'Fold this move away'}
                  aria-label={isFolded ? 'Open this move' : 'Fold this move away'}
                  aria-expanded={!isFolded}
                  className="w-5 h-5 shrink-0 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 transition-colors leading-none"
                >
                  {isFolded ? '+' : '−'}
                </button>
                <button
                  type="button"
                  onClick={() => onShowPly(draft.ply)}
                  className="font-mono text-sm text-zinc-100 hover:text-white underline decoration-zinc-700 hover:decoration-zinc-400 transition-colors"
                  title="Show this position on the board"
                >
                  {plyLabel(draft.ply, draft.san)}
                </button>
                {shownBefore !== null && (
                  <span
                    className="text-xs text-zinc-500 font-mono"
                    title={
                      live
                        ? `Depth ${ENGINE_DEPTH}, from White's side — the same depth as everything below`
                        : "From White's side, the way a board shows it"
                    }
                  >
                    {formatEval(shownBefore, game.color)} → {formatEval(shownAfter, game.color)}
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

              {isFolded ? (
                <p className="text-xs text-zinc-500">
                  {draft.unreasonable
                    ? 'Hard to find'
                    : draft.tags.length > 0
                      ? draft.tags.map(id => tagName(id, tagGroups)).join(' · ')
                      : 'Nothing written down yet.'}
                </p>
              ) : (
                <>
              {!draft.unreasonable && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>
                      Why did I play it?
                    </Label>
                    <textarea
                      value={draft.intent}
                      onChange={event => patch(draft.ply, { intent: event.target.value })}
                      rows={3}
                      placeholder="I thought it won the b2 pawn and I could get back in time…"
                      className={`${FIELD} resize-y`}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>
                      Why is it a mistake?
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
                    <Label>
                      What could I have seen or worked out?
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

              <ProposedMoves
                label="What would I play instead?"
                ply={draft.ply}
                rows={draft.better}
                fenBefore={move?.fenBefore ?? null}
                color={game.color}
                verdicts={verdicts}
                onChange={better => patch(draft.ply, { better })}
                linePlaceholder="Nd5 Bxe7 Qxe7"
                whyPlaceholder="Holds f6 and keeps the h-file shut, so the queen has nothing to come to."
                addLabel="+ another move"
                asking={asking === draft.ply}
                onAsk={() => ask(draft.ply)}
                engineAnswer={engine[draft.ply]}
                boardLine={lineOnBoard?.(draft.ply)}
              />

              <div className="flex flex-col gap-2">
                <Label>Tags</Label>
                <TagPicker
                  tags={draft.tags}
                  open={tagsOpen[draft.ply] ?? true}
                  onToggleOpen={() =>
                    setTagsOpen(prev => ({ ...prev, [draft.ply]: !(prev[draft.ply] ?? true) }))
                  }
                  onChange={newTags => patch(draft.ply, { tags: newTags })}
                  patternTags={patternTags}
                  groups={tagGroups}
                />
              </div>

              {/*
                The same idea missed for several moves running is one mistake, not four.
                Attaching the later moves here keeps them out of the entry list, out of the
                three-entry cap and out of the tag counts, while still recording that it
                went on — which is the part worth seeing later.
              */}
              {!draft.unreasonable && (
                <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
                  <Label
                    hint={
                      candidates.length === 0 && draft.repeats.length === 0
                        ? 'Every other marked move is already spoken for.'
                        : undefined
                    }
                  >
                    Same mistake at
                  </Label>

                  <div className="flex gap-1.5 flex-wrap">
                    {draft.repeats.map(repeat => (
                      <button
                        key={repeat.ply}
                        type="button"
                        onClick={() =>
                          patch(draft.ply, {
                            repeats: draft.repeats.filter(entry => entry.ply !== repeat.ply),
                          })
                        }
                        title="This one is its own mistake after all"
                        className="px-2.5 py-0.5 text-xs rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:border-sky-400 transition-colors font-mono"
                      >
                        {plyLabel(repeat.ply, repeat.san)} ×
                      </button>
                    ))}

                    {candidates.map(move => (
                      <button
                        key={move.ply}
                        type="button"
                        onClick={() =>
                          patch(draft.ply, {
                            repeats: [
                              ...draft.repeats,
                              { ply: move.ply, san: move.san, moveNumber: move.moveNumber },
                            ].sort((a, b) => a.ply - b.ply),
                          })
                        }
                        title="The same mistake as this entry — covered by it, not written up again"
                        className="px-2.5 py-0.5 text-xs rounded-full border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-colors font-mono"
                      >
                        + {plyLabel(move.ply, move.san)}
                        <span className={markColor(move.tag)}> {move.tag}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-start gap-2 text-xs text-zinc-300 cursor-pointer border-t border-zinc-800 pt-3">
                <input
                  type="checkbox"
                  checked={draft.unreasonable}
                  onChange={event => patch(draft.ply, { unreasonable: event.target.checked })}
                  className="mt-0.5 accent-zinc-400"
                />
                <span>
                  Hard to find — no clear way I could have seen it
                  <span className="block text-zinc-600">
                    Still recorded, but left out of the tag counts: there is no pattern to train
                    from a move you had no way of finding.
                  </span>
                </span>
              </label>

                </>
              )}
            </div>
          )
        })}

        {drafts.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nothing taken apart yet — the engine&apos;s own objections are offered first, worst
            loss leading. A game that needed no post-mortem can go straight to the notes.
          </p>
        )}
      </Group>

      {/*
        The other way to write about a move. Its own picker rather than a second button
        on each candidate chip: those are the engine's objections, and most moves worth
        a note are ones it had nothing to say about. Any move of either side — what your
        opponent did is half the game, and the reason you played what you played.
      */}
      <Group
        title="Notes"
        line="anything worth remembering, yours or theirs — no cap, no questions"
        meta={`${noteDrafts.length} ${noteDrafts.length === 1 ? 'move' : 'moves'}`}
      >
        <div className="flex flex-col gap-2">
          {/* the section line above already says whose moves and that nothing is asked */}
          <Label>Moves worth noting</Label>

          <div className="flex gap-1.5 flex-wrap items-center">
            <select
              value=""
              onChange={event => {
                if (event.target.value) addNote(Number(event.target.value))
              }}
              className="bg-zinc-950 border border-zinc-800 rounded-full px-3 py-1 text-xs text-zinc-400 outline-none focus:border-zinc-600"
            >
              <option value="">+ a move to note…</option>
              {plies
                .filter(ply => !taken.has(ply.index))
                .map(ply => (
                  <option key={ply.index} value={ply.index}>
                    {plyLabel(ply.index, ply.san)}
                    {ply.color === game.color ? '' : ' — them'}
                  </option>
                ))}
            </select>

            {noteDrafts.length === 0 && (
              <span className="text-xs text-zinc-600">
                Nothing noted yet.
              </span>
            )}
          </div>
        </div>

        {noteDrafts.map(draft => {
          const move = plyByIndex.get(draft.ply)
          const judged = verdicts[verdictKey(draft.ply, draft.san)]
          const live = judged && judged !== 'failed' ? judged : null

          return (
            <MoveNoteCard
              key={draft.ply}
              draft={draft}
              yours={move ? move.color === game.color : true}
              color={game.color}
              fenBefore={move?.fenBefore ?? null}
              folded={folded[draft.ply] ?? false}
              onToggleFold={() =>
                setFolded(prev => ({ ...prev, [draft.ply]: !(prev[draft.ply] ?? false) }))
              }
              tagsOpen={tagsOpen[draft.ply] ?? false}
              onToggleTags={() =>
                setTagsOpen(prev => ({ ...prev, [draft.ply]: !(prev[draft.ply] ?? false) }))
              }
              onChange={changes => patchNote(draft.ply, changes)}
              onRemove={() => {
                setSaved(null)
                setNoteDrafts(prev => prev.filter(entry => entry.ply !== draft.ply))
              }}
              onShowPly={() => onShowPly(draft.ply)}
              verdicts={verdicts}
              patternTags={patternTags}
              tagGroups={tagGroups}
              asking={asking === draft.ply}
              onAsk={() => ask(draft.ply)}
              engineAnswer={engine[draft.ply]}
              boardLine={lineOnBoard?.(draft.ply)}
              live={live}
            />
          )
        })}

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
      </Group>

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
