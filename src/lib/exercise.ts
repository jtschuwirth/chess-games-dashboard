/**
 * Exercise guides: a coach's sheet of positions, and what you worked out on each.
 *
 * The positions come from somewhere else — a PDF, a book, a screenshot — so an exercise
 * starts as a FEN you paste in. Lichess has no endpoint that turns a picture of a board
 * into one, and the service that does scan diagrams sells consumer apps rather than an
 * API, so there is nothing to call here and the field is a box you fill.
 *
 * Everything below the position is the app's own machinery reused: the solution is a
 * `PatternLine`, which is already "a position with moves on top of it", so the board,
 * the branches and the comment on a move all come for free.
 */
import { START_FEN } from './movetree'
import { emptyLine, emptyPositionLine, fenIsValid, parsePatternPgn } from './pattern'
import type { Exercise, ExerciseGuide, NewExerciseGuide, PatternLine } from '@/types/chess'

/** Past this a sheet is a syllabus, and wants to be two guides. */
export const MAX_EXERCISES = 60

/** The moves of a stored PGN, or none when it no longer plays from its position. */
function readMoves(pgn: string, startFen: string): string[] {
  try {
    return parsePatternPgn(pgn, startFen)
  } catch {
    return []
  }
}

/** An id for an exercise, so a solution is tied to its position and not to its place. */
export function newExerciseId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * A fresh exercise: the starting position and nothing else.
 *
 * The title is left empty rather than pre-filled with its number. The card already shows
 * `Exercise 3` as the placeholder and falls back to it when drawing, so writing the
 * number in would be text you did not type — and text you did not type must not be what
 * keeps an exercise you added and never filled from being dropped on save.
 */
export function emptyExercise(): Exercise {
  return { id: newExerciseId(), line: emptyPositionLine(), solved: false }
}

/**
 * A stored exercise in the shape the code expects.
 *
 * An id is minted when one is missing rather than derived from anything, because there
 * is nothing stable to derive it from — two exercises on a sheet can carry the same
 * position and the same empty solution. A guide written before ids existed therefore
 * gets fresh ones on its first read, which is harmless: nothing points at an exercise
 * from outside the guide.
 */
export function normalizeExercise(raw: unknown): Exercise | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Partial<Exercise> & { fen?: unknown }

  const stored = (entry.line && typeof entry.line === 'object' ? entry.line : {}) as Partial<PatternLine>

  /*
   * A position is what makes an exercise an exercise, so there is always one. A FEN that
   * will not read falls back to the starting position rather than reaching a board that
   * cannot draw it — this runs in a render, and a hand-edited document must not be able
   * to take the page down.
   */
  const startFen =
    typeof stored.startFen === 'string' && fenIsValid(stored.startFen)
      ? stored.startFen
      : START_FEN

  const pgn = typeof stored.pgn === 'string' ? stored.pgn : ''
  const line: PatternLine = {
    ...emptyLine(),
    startFen,
    title: typeof stored.title === 'string' ? stored.title : '',
    note: typeof stored.note === 'string' ? stored.note : '',
    pgn,
    // re-read rather than trusted: the moves and the PGN are two copies of one thing,
    // and the PGN is the authority
    moves: readMoves(pgn, startFen),
    comments: stored.comments && typeof stored.comments === 'object' ? stored.comments : {},
  }
  if (stored.orientation === 'white' || stored.orientation === 'black') {
    line.orientation = stored.orientation
  }

  return {
    id: typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : newExerciseId(),
    line,
    solved: entry.solved === true,
  }
}

/** A stored guide in the shape the code expects, whatever the document holds. */
export function normalizeGuide(raw: ExerciseGuide): ExerciseGuide {
  return {
    ...raw,
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    exercises: (Array.isArray(raw.exercises) ? raw.exercises : [])
      .map(normalizeExercise)
      .filter((entry): entry is Exercise => entry !== null)
      .slice(0, MAX_EXERCISES),
  }
}

/**
 * The stored shape, without the document id Firestore keeps separately.
 *
 * `updatedAt` is deliberately not here: it is stamped by the write, so a save can
 * neither forget it nor round-trip a stale one. The same rule `planBody` follows.
 */
export function guideBody(guide: ExerciseGuide): NewExerciseGuide {
  return {
    name: guide.name,
    description: guide.description,
    exercises: guide.exercises,
    createdAt: guide.createdAt,
  }
}

/** Whether an exercise says anything at all, for dropping the ones you started and left. */
export function exerciseHasContent(exercise: Exercise): boolean {
  const { line } = exercise

  /*
   * Deliberately not `lineHasContent`, which counts any `startFen` at all — and every
   * exercise has one, so it answers yes to a card you added and never touched. What makes
   * an exercise real is a position that is not the starting position, or something you
   * wrote on it.
   */
  return (
    exercise.solved ||
    line.title.trim().length > 0 ||
    line.note.trim().length > 0 ||
    line.moves.length > 0 ||
    (line.startFen ?? START_FEN) !== START_FEN
  )
}

/** Whether a solution has been written, which is what "worked out" is counted from. */
export function hasSolution(exercise: Exercise): boolean {
  return exercise.line.moves.length > 0 || exercise.line.note.trim().length > 0
}

export interface GuideProgress {
  total: number
  solved: number
  /** Started but not marked solved — a line played and left, or a note written. */
  attempted: number
}

/**
 * How far through a sheet you are.
 *
 * `solved` is what you said, not what the app worked out: nothing here checks an answer,
 * and a position you solved in your head and wrote one line for is as done as one you
 * annotated to the last move. `attempted` is the honest middle — something written, not
 * yet called finished — which is the pile worth coming back to.
 */
export function guideProgress(guide: ExerciseGuide): GuideProgress {
  const total = guide.exercises.length
  const solved = guide.exercises.filter(entry => entry.solved).length
  const attempted = guide.exercises.filter(
    entry => !entry.solved && hasSolution(entry),
  ).length

  return { total, solved, attempted }
}

/**
 * One exercise moved a place up or down the sheet.
 *
 * Found by id rather than by an index the caller captured: several presses can land in
 * one React batch, and each would otherwise swap against the list as it was drawn rather
 * than as it is — three quick taps would then land as one. The same rule every plan edit
 * follows.
 *
 * A move off either end is no move: the list comes back as it was, so the caller never
 * has to range-check before asking.
 */
/**
 * Whether two exercises differ in anything that would be written.
 *
 * A structural compare rather than a flag, which is what lets a Save button know it has
 * something to do. The flag it replaces could only ever say "something was touched":
 * typing a word and deleting it again left the sheet reading `unsaved changes` with
 * nothing to save, and after saving one exercise there would have been no way to work
 * out whether the others still needed it.
 */
export function exerciseChanged(a: Exercise | undefined, b: Exercise | undefined): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
}

export function moveExercise(
  exercises: Exercise[],
  id: string,
  direction: -1 | 1,
): Exercise[] {
  const at = exercises.findIndex(entry => entry.id === id)
  const to = at + direction
  if (at < 0 || to < 0 || to >= exercises.length) return exercises

  const next = [...exercises]
  ;[next[at], next[to]] = [next[to], next[at]]
  return next
}

/** Whose move it is in the diagram, which is what the sheet means by "White to play". */
export function toPlay(exercise: Exercise): 'white' | 'black' {
  const fen = exercise.line.startFen ?? START_FEN
  return fen.split(/\s+/)[1] === 'b' ? 'black' : 'white'
}
