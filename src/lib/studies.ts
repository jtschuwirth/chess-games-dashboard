/**
 * Studies: the written-up thing itself, composed of what is already on disk.
 *
 * `lib/study.ts` holds the *body* — the sections, the ideas, the links — which was
 * written when a study was a field on a saved opening line and is unchanged here. This
 * module is the document around it: what kind of thing it is about, which saved lines it
 * covers, which patterns apply, which other studies it runs into, and which model games
 * show it played.
 *
 * Nothing here stores a second copy of anything. A study is a name, a kind, some prose
 * and five lists of ids, and every figure on its page — how the games went, which
 * variations sit under the line, which studies lead *here* — is read off the collections
 * those ids point into. That is the rule the opening write-up was built on, and it is
 * what lets one isolated-queen's-pawn study serve the Panov, the Queen's Gambit and the
 * Nimzo rather than being typed out three times.
 */
import { emptyStudy, normalizeStudy, studyBody } from './study'
import { lineBody, lineHasContent, normalizeLine } from './pattern'
import type {
  ModelGameRef,
  PatternLine,
  NewStudyRecord,
  OpeningColor,
  StudyKind,
  StudyRecord,
  StudyRef,
} from '@/types/chess'

export const STUDY_KINDS: StudyKind[] = ['opening', 'structure', 'endgame', 'theme']

export const STUDY_KIND_LABEL: Record<StudyKind, string> = {
  opening: 'Opening',
  structure: 'Structure',
  endgame: 'Endgame',
  theme: 'Theme',
}

/**
 * What each kind is for, as the tooltip on its chip.
 *
 * The one distinction worth a sentence is opening against structure, because that is the
 * one the whole section turns on: an opening study names move orders, and a structure
 * study is pointed *at* by the openings that reach it.
 */
export const STUDY_KIND_HINT: Record<StudyKind, string> = {
  opening: 'A move order — the saved lines it covers, and the games that reached them',
  structure:
    'A position type several openings run into: an isolated queen’s pawn, a Carlsbad',
  endgame: 'An ending: rook and pawn, two bishops, a theoretical draw',
  theme: 'An idea that is neither a move order nor a structure — attacking a castled king',
}

/**
 * A kind's colour, drawn from families the analysis has not already spent: red is a
 * blunder, amber a mistake, violet the engine, sky a review, emerald a move that held.
 */
export const STUDY_KIND_BADGE: Record<StudyKind, string> = {
  opening: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  structure: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  endgame: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  theme: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
}

/**
 * A kind off the query string, or null.
 *
 * Checked against the list rather than cast, the rule the shape filter and the pattern
 * finder both follow: a hand-typed URL must not be able to invent a category the screen
 * cannot draw.
 */
export function readStudyKind(raw: string | null | undefined): StudyKind | null {
  return raw && (STUDY_KINDS as string[]).includes(raw) ? (raw as StudyKind) : null
}

/** A study with nothing written in it yet. A function, so no two callers share an array. */
export function newStudy(fields: {
  name: string
  kind: StudyKind
  color: OpeningColor
  description: string
  /** The saved line it is about, where it was started from one. */
  openingId?: string
  createdAt: number
}): NewStudyRecord {
  return {
    name: fields.name.trim(),
    kind: fields.kind,
    color: fields.color,
    description: fields.description.trim(),
    openingIds: fields.openingId ? [fields.openingId] : [],
    patternIds: [],
    related: [],
    games: [],
    examples: [],
    body: emptyStudy(),
    createdAt: fields.createdAt,
  }
}

/**
 * A study in the shape Firestore will take.
 *
 * Every optional field is set or left out and never assigned `undefined` — an undefined
 * value rejects the whole document rather than the field, which is a save that fails for
 * a reason nothing on screen can explain. The same job `patternBody`, `studyBody` and
 * `planBody` do, in the domain module rather than in `firestore.ts`, so it can be checked
 * without starting Firebase.
 *
 * `updatedAt` is left out deliberately: it is stamped by the writer, so a save can
 * neither forget it nor round-trip a stale one — the plan page's rule, and what lets an
 * unsaved draft be told from one another device has moved past.
 */
export function studyRecordBody(study: NewStudyRecord): NewStudyRecord {
  return {
    name: study.name.trim(),
    kind: study.kind,
    color: study.color,
    description: study.description.trim(),
    openingIds: [...new Set(study.openingIds.filter(id => id.length > 0))],
    patternIds: [...new Set(study.patternIds.filter(id => id.length > 0))],
    related: study.related
      .filter(ref => ref.studyId.length > 0)
      .map(ref => {
        const next: StudyRef = { studyId: ref.studyId }
        if (ref.note && ref.note.trim().length > 0) next.note = ref.note.trim()
        return next
      }),
    games: study.games
      .filter(ref => ref.gameId.length > 0)
      .map(ref => {
        const next: ModelGameRef = { gameId: ref.gameId }
        if (typeof ref.ply === 'number' && Number.isFinite(ref.ply)) {
          next.ply = Math.max(0, Math.round(ref.ply))
        }
        if (ref.note && ref.note.trim().length > 0) next.note = ref.note.trim()
        return next
      }),
    // an empty board card is dropped here rather than refused in the form: a card you
    // opened and left blank is not worth storing, and taking it away under the cursor
    // while you think would be worse
    examples: study.examples.filter(lineHasContent).map(lineBody),
    body: studyBody(study.body),
    createdAt: study.createdAt,
  }
}

/**
 * Whether two studies differ, which is what "unsaved" means.
 *
 * Compared as JSON through the writer, so what is compared is what would be written —
 * typing a space into the description is not an unsaved change. Both sides are built by
 * the same function, so the key order matches; a hand-written deep equal would be a
 * second definition of what a study is and would rot against this one.
 */
export function studyRecordChanged(a: NewStudyRecord, b: NewStudyRecord): boolean {
  return JSON.stringify(studyRecordBody(a)) !== JSON.stringify(studyRecordBody(b))
}

function readIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

/**
 * A stored study in the shape the code expects, whatever shape it was written in.
 *
 * An unknown kind becomes `theme` rather than being dropped: a document whose kind the
 * screen cannot draw is still a study somebody wrote, and `theme` is the kind that claims
 * least about it. That is the opposite of what the *filter* does with an unknown value,
 * for the reason a missing link section is defaulted while an unknown idea section is
 * dropped — losing the document is worse than mis-filing it.
 */
export function normalizeStudyRecord(raw: StudyRecord): StudyRecord {
  const stored = raw as Partial<StudyRecord> & { id: string }
  const colors: string[] = ['white', 'black', 'any']

  return {
    id: stored.id,
    name: typeof stored.name === 'string' ? stored.name : '',
    kind: readStudyKind(stored.kind) ?? 'theme',
    color: colors.includes(stored.color as string) ? (stored.color as OpeningColor) : 'any',
    description: typeof stored.description === 'string' ? stored.description : '',
    openingIds: readIds(stored.openingIds),
    patternIds: readIds(stored.patternIds),
    related: (Array.isArray(stored.related) ? stored.related : [])
      .filter(ref => ref && typeof ref.studyId === 'string' && ref.studyId.length > 0)
      // a study cannot run into itself, and one that said so would draw a row linking to
      // the page you are standing on
      .filter(ref => ref.studyId !== stored.id)
      .map(ref => ({
        studyId: ref.studyId,
        ...(typeof ref.note === 'string' && ref.note.length > 0 ? { note: ref.note } : {}),
      })),
    games: (Array.isArray(stored.games) ? stored.games : [])
      .filter(ref => ref && typeof ref.gameId === 'string' && ref.gameId.length > 0)
      .map(ref => ({
        gameId: ref.gameId,
        ...(typeof ref.ply === 'number' && Number.isFinite(ref.ply)
          ? { ply: Math.max(0, Math.round(ref.ply)) }
          : {}),
        ...(typeof ref.note === 'string' && ref.note.length > 0 ? { note: ref.note } : {}),
      })),
    examples: (Array.isArray(stored.examples) ? stored.examples : [])
      .map(normalizeLine)
      .filter((line): line is PatternLine => line !== null),
    body: normalizeStudy(stored.body),
    createdAt: typeof stored.createdAt === 'number' ? stored.createdAt : 0,
    ...(typeof stored.updatedAt === 'number' ? { updatedAt: stored.updatedAt } : {}),
  }
}

/* ------------------------------------------------------------------- linking */

/** The study with another one added to what it runs into, or left alone if it is there. */
export function withRelated(study: NewStudyRecord, studyId: string): NewStudyRecord {
  if (study.related.some(ref => ref.studyId === studyId)) return study
  return { ...study, related: [...study.related, { studyId }] }
}

export function withoutRelated(study: NewStudyRecord, studyId: string): NewStudyRecord {
  return { ...study, related: study.related.filter(ref => ref.studyId !== studyId) }
}

export function withRelatedNote(
  study: NewStudyRecord,
  studyId: string,
  note: string,
): NewStudyRecord {
  return {
    ...study,
    related: study.related.map(ref => (ref.studyId === studyId ? { ...ref, note } : ref)),
  }
}

/** A model game cited, pointed where its author pointed it until you say otherwise. */
export function withGame(study: NewStudyRecord, gameId: string, ply?: number): NewStudyRecord {
  if (study.games.some(ref => ref.gameId === gameId)) return study
  return {
    ...study,
    games: [...study.games, { gameId, ...(typeof ply === 'number' ? { ply } : {}) }],
  }
}

export function withoutGame(study: NewStudyRecord, gameId: string): NewStudyRecord {
  return { ...study, games: study.games.filter(ref => ref.gameId !== gameId) }
}

/**
 * One citation changed — where the board opens, or why the game is here.
 *
 * A patch rather than two setters, because both are edited in the same row and a `ply` of
 * `undefined` has to be expressible: clearing the box means "wherever the game itself
 * opens", which is not the same thing as ply 0.
 */
export function withGameRef(
  study: NewStudyRecord,
  gameId: string,
  patch: Partial<Omit<ModelGameRef, 'gameId'>>,
): NewStudyRecord {
  return {
    ...study,
    games: study.games.map(ref => (ref.gameId === gameId ? { ...ref, ...patch, gameId } : ref)),
  }
}

/** A toggle for anything held as a flat list of ids — the openings and the patterns. */
export function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(entry => entry !== id) : [...list, id]
}

/* -------------------------------------------------------------------- reading */

/**
 * The studies that run into this one — the other end of `related`, derived.
 *
 * This is what makes a structure study worth having: the isolated-queen's-pawn page lists
 * the Panov, the Queen's Gambit and everything else that arrives there, carrying the note
 * each of them wrote about how it gets there, and not one of those sentences is stored
 * twice. There are a handful of studies, so reading all of them costs nothing.
 */
export function studiesLeadingTo(
  studies: StudyRecord[],
  studyId: string,
): { study: StudyRecord; note?: string }[] {
  return studies.flatMap(study => {
    const ref = study.related.find(entry => entry.studyId === studyId)
    return ref ? [{ study, ...(ref.note ? { note: ref.note } : {}) }] : []
  })
}

export interface StudyFilters {
  search: string
  kind: StudyKind | null
}

export const NO_STUDY_FILTERS: StudyFilters = { search: '', kind: null }

export function studyFiltersActive(filters: StudyFilters): number {
  return (filters.search.trim().length > 0 ? 1 : 0) + (filters.kind ? 1 : 0)
}

/**
 * Whether a study is in the slice. The search reads the name and the description, which
 * is where the words you would look for are — "isolani" tends to be in the sentence
 * rather than in the title.
 */
export function matchesStudy(study: StudyRecord, filters: StudyFilters): boolean {
  if (filters.kind && study.kind !== filters.kind) return false

  const needle = filters.search.trim().toLowerCase()
  if (needle.length === 0) return true

  return `${study.name} ${study.description}`.toLowerCase().includes(needle)
}

/**
 * The list in the order it reads: by kind, then by name.
 *
 * Grouped by kind with the kind as a badge rather than under headings to scroll past,
 * which is the patterns finder's own answer — twelve rows is a glance where twelve cards
 * is a screenful.
 */
export function sortStudies(studies: StudyRecord[]): StudyRecord[] {
  return [...studies].sort(
    (a, b) =>
      STUDY_KINDS.indexOf(a.kind) - STUDY_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name),
  )
}

/** How much is in a study, which is what a row in the finder reads under the name. */
export function studySize(study: StudyRecord): {
  ideas: number
  boards: number
  patterns: number
  games: number
  studies: number
  links: number
} {
  return {
    ideas: study.body.ideas.filter(idea => idea.text.trim().length > 0).length,
    boards: study.examples.length,
    patterns: study.patternIds.length,
    games: study.games.length,
    studies: study.related.length,
    links: study.body.links.length,
  }
}

/* ------------------------------------------------------------------ sections */

export type StudyPanelId =
  | 'overview'
  | 'boards'
  | 'plans'
  | 'patterns'
  | 'leads'
  | 'models'
  | 'openings'
  | 'results'
  | 'lines'
  | 'references'

export interface StudyPanel {
  id: StudyPanelId
  title: string
  /** What belongs here, shown where the panel is empty. Its own prompt. */
  hint: string
}

/**
 * Every panel of a study, in the order they read.
 *
 * Three groups, the order the opening write-up settled on: what you know (overview,
 * plans, patterns), what it connects to (studies, model games, openings and what your own
 * games did there), and where it is written up elsewhere (lines, references). A table
 * rather than prose on the page, for the reason `TRANSITIONS` and `ESSENTIALS_SECTIONS`
 * are tables: a panel's empty state is the one place that says what it is for, and a
 * screen describing a rule separately describes what the rule used to be.
 */
export const STUDY_PANELS: StudyPanel[] = [
  {
    id: 'overview',
    title: 'Overview',
    hint: 'What this is, and what it is trying to get.',
  },
  {
    /*
      The board, directly under the overview and above the plans, because that is the
      order you read in: what this is, the position it is about, then what to do in it.
      A plan written about a structure is a sentence you nod at until you can see the
      structure, which is the whole reason this panel exists.
    */
    id: 'boards',
    title: 'Boards',
    hint: 'A line or a position to read the rest of this against — pasted as a PGN or a FEN.',
  },
  {
    id: 'plans',
    title: 'Plans and ideas',
    hint: 'What each side is trying to do, and what to punish when they get it wrong.',
  },
  {
    id: 'patterns',
    title: 'Patterns here',
    hint: 'Ideas written up on the patterns page. Link one and it can be drilled there.',
  },
  {
    id: 'leads',
    title: 'Leads into',
    // the sentence this panel exists for: the Panov reaching the isolani is a fact about
    // a line, and the line is what the note says
    hint: 'Another study this one runs into — say which line gets there, and study it there.',
  },
  {
    id: 'models',
    title: 'Model games',
    hint: 'Games showing it played, each opened on the move it is here for.',
  },
  {
    id: 'openings',
    title: 'Openings',
    hint: 'The saved lines this covers. Link one and your own games here are read off it.',
  },
  {
    id: 'results',
    title: 'Your games here',
    hint: 'How the games that reached these lines have gone.',
  },
  {
    id: 'lines',
    title: 'Line studies',
    hint: 'A lichess study of these lines. Paste a chapter and it plays here on a board.',
  },
  {
    id: 'references',
    title: 'References',
    hint: 'Where else this is written up — a video, a book, an article.',
  },
]

export const PANEL_BY_ID = new Map(STUDY_PANELS.map(panel => [panel.id, panel]))

/**
 * The key a panel remembers its fold state under.
 *
 * Prefixed, because `useFolded` keeps one record for the whole app and `games`,
 * `patterns` and `results` already belong to other pages — sharing a key would fold two
 * unrelated panels together. Deliberately *not* keyed by study: folding Model games away
 * says you do not want that panel, not that you do not want it on this one study.
 */
export function studyPanelId(panel: StudyPanelId): string {
  return `studydoc-${panel}`
}
