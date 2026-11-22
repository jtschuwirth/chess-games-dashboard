/**
 * Model games: games somebody else played, kept to study.
 *
 * Their own collection rather than a `GameRecord` with `source: 'upload'`, and that is
 * the whole decision. An uploaded game is **yours**: `any` means any, so it counts in
 * every slice, every split and every rating pool — and a hundred of Karpov's games in
 * that figure would quietly answer a different question from the one the dashboard
 * claims. These are reference material, so they are kept where nothing counting your own
 * record can see them.
 *
 * The game itself is a `PatternLine`, because that is already exactly what it is: a PGN
 * kept whole, the moves parsed off it, where the board opens, which way round to read it
 * and a comment on any move. So the board, the variations, the PGN round trip and the
 * per-move commentary all arrive working, and the editor is `useLineEditor` — the same
 * control the pattern form and the exercise sheet use.
 */
import { clampStartPly, emptyLine, lineBody, parsePatternPgn } from './pattern'
import { moveNumberAt, colorAt, START_FEN } from './movetree'
import { pgnHeaders } from './upload'
import type { ModelGame, NewModelGame, PatternLine, PgnResult } from '@/types/chess'

export const PGN_RESULTS: PgnResult[] = ['1-0', '0-1', '1/2-1/2', '*']

/** What a result is called where it is read as a word rather than as a score. */
export const RESULT_LABEL: Record<PgnResult, string> = {
  '1-0': 'White won',
  '0-1': 'Black won',
  '1/2-1/2': 'Drawn',
  '*': 'Unfinished',
}

export function readPgnResult(raw: string | null | undefined): PgnResult | null {
  return raw && (PGN_RESULTS as string[]).includes(raw) ? (raw as PgnResult) : null
}

/** A model game with nothing in it, which is what the paste box fills in. */
export function emptyModelGame(createdAt: number): NewModelGame {
  return {
    white: '',
    black: '',
    event: '',
    result: '*',
    description: '',
    line: emptyLine(),
    createdAt,
  }
}

/**
 * What the PGN says about who played, where, when and how it ended.
 *
 * Only the fields a model game has — there is no clock to read, no side that is you and
 * no rating pool to file it under, which is most of what `parseUpload` does with the
 * same headers. A field the PGN does not carry comes back empty rather than guessed at,
 * so the form can fill in what it knows and leave the rest to be typed.
 */
export function modelGameHeaders(pgn: string): {
  white: string
  black: string
  event: string
  year?: number
  result: PgnResult
} {
  const headers = pgnHeaders(pgn)
  const year = Number((headers.Date ?? headers.UTCDate ?? '').split('.')[0])

  return {
    white: headers.White ?? '',
    black: headers.Black ?? '',
    event: headers.Event ?? '',
    ...(Number.isFinite(year) && year > 1400 ? { year } : {}),
    result: readPgnResult(headers.Result) ?? '*',
  }
}

/**
 * The line of a pasted game, read from the PGN.
 *
 * Throws what `parsePatternPgn` throws, which the form catches and shows — the text is
 * kept whatever happens, the bargain every line editor here makes with a PGN that will
 * not read yet.
 */
export function lineFromPgn(line: PatternLine, pgn: string): PatternLine {
  const moves = parsePatternPgn(pgn, line.startFen)
  return { ...line, pgn, moves, startPly: clampStartPly(line.startPly, moves) }
}

/** Who played it: the one thing that names a game somebody else played. */
export function modelGameLabel(game: ModelGame | NewModelGame): string {
  const white = game.white.trim() || 'White'
  const black = game.black.trim() || 'Black'
  return `${white} – ${black}`
}

/**
 * Where and when, with the result — the line under the name.
 *
 * Built out of whatever is there rather than printing placeholders for what is not: a
 * game off a book page often has nobody's idea of an event, and `· ·` reads as the page
 * having failed rather than as a header the PGN did not carry.
 */
export function modelGameMeta(game: ModelGame | NewModelGame): string {
  return [
    [game.event.trim(), game.year ? String(game.year) : ''].filter(Boolean).join(' '),
    game.result === '*' ? '' : game.result,
  ]
    .filter(part => part.length > 0)
    .join(' · ')
}

/** Whether there is anything worth storing, which is what the save button asks. */
export function modelGameHasContent(game: NewModelGame): boolean {
  return (
    game.white.trim().length > 0 ||
    game.black.trim().length > 0 ||
    game.line.moves.length > 0 ||
    game.description.trim().length > 0
  )
}

/**
 * How a ply reads as a move — `11…cxd5`, or `move 11` where there is no move there.
 *
 * What a study's citation is written in: the reference says the board opens on move 11,
 * so the row has to say move 11 rather than ply 21. The number comes off the position the
 * game starts from, which is the opening one for a game and anything at all for a line
 * that began as a FEN.
 */
export function plyLabel(game: ModelGame | NewModelGame, ply: number): string {
  const start = (game.line.startFen ?? '').trim() || START_FEN
  const at = clampStartPly(ply, game.line.moves)
  if (at === 0) return 'the start'

  const san = game.line.moves[at - 1]
  const number = moveNumberAt(start, at - 1)
  const black = colorAt(start, at - 1) === 'black'
  return san ? `${number}${black ? '…' : '.'}${san}` : `move ${number}`
}

/**
 * A model game in the shape Firestore will take.
 *
 * Every optional field set or left out, never assigned — an undefined value rejects the
 * whole document rather than the field. `line` goes through `lineBody`, which is the one
 * statement of which of a line's fields may be absent.
 */
export function modelGameBody(game: NewModelGame): NewModelGame {
  const body: NewModelGame = {
    white: game.white.trim(),
    black: game.black.trim(),
    event: game.event.trim(),
    result: game.result,
    description: game.description.trim(),
    line: lineBody(game.line),
    createdAt: game.createdAt,
  }

  if (typeof game.year === 'number' && Number.isFinite(game.year)) body.year = Math.round(game.year)

  return body
}

export function modelGameChanged(a: NewModelGame, b: NewModelGame): boolean {
  return JSON.stringify(modelGameBody(a)) !== JSON.stringify(modelGameBody(b))
}

/** A stored model game in the shape the code expects, whatever shape it was written in. */
export function normalizeModelGame(raw: ModelGame): ModelGame {
  const stored = raw as Partial<ModelGame> & { id: string }
  const line = stored.line

  return {
    id: stored.id,
    white: typeof stored.white === 'string' ? stored.white : '',
    black: typeof stored.black === 'string' ? stored.black : '',
    event: typeof stored.event === 'string' ? stored.event : '',
    ...(typeof stored.year === 'number' ? { year: stored.year } : {}),
    result: readPgnResult(stored.result) ?? '*',
    description: typeof stored.description === 'string' ? stored.description : '',
    // a hand-edited document must not be able to hand a board something that is not a
    // line: the editor and the reader both assume the moves are an array
    line:
      line && typeof line === 'object' && Array.isArray(line.moves)
        ? { ...emptyLine(), ...line }
        : emptyLine(),
    createdAt: typeof stored.createdAt === 'number' ? stored.createdAt : 0,
    ...(typeof stored.updatedAt === 'number' ? { updatedAt: stored.updatedAt } : {}),
  }
}

/**
 * The games in the order they read: by year, newest first, then by who played.
 *
 * Not by when you added them, which is what `createdAt` says and is nothing about the
 * game — a sheet of Karpov's games pasted in one evening would be in paste order, which
 * is no order at all. A game with no year sorts last, since nothing is known about when
 * it was played.
 */
export function sortModelGames(games: ModelGame[]): ModelGame[] {
  return [...games].sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0) || modelGameLabel(a).localeCompare(modelGameLabel(b)),
  )
}
