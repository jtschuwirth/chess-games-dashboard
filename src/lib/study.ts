/**
 * What you know about an opening, written on the line you already saved.
 *
 * A study is not a document store of its own. The line is already there, already nested
 * in a repertoire tree, already matching your games by position — so the only new thing
 * is the prose, and everything around it is read off what is on disk. Variants are the
 * node's children, the games are the slice the dashboard would show, and the patterns are
 * the ones naming this opening. None of that is stored twice and none of it can drift.
 *
 * The sections come from a table rather than from the page, for the reason `TRANSITIONS`
 * and `GAME_NAMES` do: a screen that describes a rule in prose describes what the rule
 * used to be. Adding a section is one row here.
 */
import type {
  Color,
  IdeaRank,
  OpeningStudy,
  StudyCitation,
  StudyIdea,
  StudyLink,
  StudyLinkSectionId,
  StudySectionId,
} from '@/types/chess'

export interface StudySection {
  id: StudySectionId | 'variants' | 'games' | StudyLinkSectionId
  title: string
  /** What belongs here, shown where the section is empty. The section's own prompt. */
  hint: string
  /** Written here, or read off something else. */
  holds: 'ideas' | 'links' | 'derived'
  /** Ideas in this section belong to one side, and are offered under both. */
  sided?: boolean
  /** Ideas in this section are a main plan or a sideline. */
  ranked?: boolean
}

/**
 * Every section of a study, in the order they read.
 *
 * Deliberately short. The sections that hold prose are two, because a form with eight
 * boxes is eight boxes left empty — what makes a study standard is the *shape of an
 * idea*, which carries a side, a rank, the pattern it belongs to and the games showing
 * it. A new section is one row here and nothing else.
 */
export const STUDY_SECTIONS: StudySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    hint: 'What this opening is for, and what it is trying to get.',
    holds: 'ideas',
  },
  {
    id: 'plans',
    title: 'Plans and ideas',
    hint: 'What each side is trying to do, and what to punish when they get it wrong.',
    holds: 'ideas',
    sided: true,
    ranked: true,
  },
  {
    id: 'variants',
    title: 'Variants',
    hint: 'Save a longer line on the openings page and it files itself under this one.',
    holds: 'derived',
  },
  {
    id: 'games',
    title: 'Your games here',
    hint: 'Every game that reached this position, transpositions included.',
    holds: 'derived',
  },
  {
    id: 'lines',
    title: 'Line studies',
    // says what belongs here *and* the thing that decides what you get: a chapter plays
    // on a board, a bare study link can only be a link
    hint: 'A lichess study of these lines. Paste a chapter and it plays here on a board.',
    holds: 'links',
  },
  {
    id: 'references',
    title: 'References',
    hint: 'Where else this is written up — a video, a study, an article.',
    holds: 'links',
  },
]

export const SECTION_BY_ID = new Map(STUDY_SECTIONS.map(section => [section.id, section]))

/**
 * The key a section's panel remembers its fold state under.
 *
 * Prefixed because `useFolded` keeps one record for the whole app: `games` and
 * `variations` already belong to the dashboard, and sharing them would fold two
 * unrelated panels together. It is derived here rather than written out on the page so
 * that the rule is somewhere a test can reach.
 *
 * Deliberately *not* keyed by opening: folding Variants away says you do not want that
 * section, not that you do not want it on this one line.
 */
export function panelId(section: StudySection['id']): string {
  return `study-${section}`
}

/** The sections an idea may be filed under — the ones that hold prose. */
export const IDEA_SECTIONS: StudySectionId[] = ['overview', 'plans']

/** The sections a link may be filed under — the ones that hold links. */
export const LINK_SECTIONS: StudyLinkSectionId[] = ['lines', 'references']

export const RANKS: IdeaRank[] = ['main', 'alternative']

export const RANK_LABEL: Record<IdeaRank, string> = {
  main: 'Main plans',
  alternative: 'Alternative plans',
}

export const CITATION_LABEL: Record<StudyCitation['shows'], string> = {
  well: 'played it',
  badly: 'went wrong here',
}

export const CITATION_BADGE: Record<StudyCitation['shows'], string> = {
  well: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  badly: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

/** A study with nothing in it. A function, so no two callers share one set of arrays. */
export function emptyStudy(): OpeningStudy {
  return { ideas: [], links: [], alsoReaches: [] }
}

/**
 * An id for a new idea.
 *
 * Random rather than an index: an index would change under a reorder, and a citation
 * pointing at "the third bullet" is pointing at whichever bullet is third. Called from an
 * event handler and never from a render, which is what the purity rule asks.
 */
export function newIdeaId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function emptyIdea(section: StudySectionId, side?: Color, rank?: IdeaRank): StudyIdea {
  const idea: StudyIdea = { id: newIdeaId(), section, text: '' }
  if (side) idea.side = side
  if (rank) idea.rank = rank
  return idea
}

/** The ideas in one section, optionally narrowed to a side and a rank, in stored order. */
export function ideasIn(
  study: OpeningStudy,
  section: StudySectionId,
  side?: Color,
  rank?: IdeaRank,
): StudyIdea[] {
  return study.ideas.filter(
    idea =>
      idea.section === section &&
      (side === undefined || idea.side === side) &&
      (rank === undefined || (idea.rank ?? 'main') === rank),
  )
}

/**
 * The links in one section, in stored order — the links half of `ideasIn`.
 *
 * One array holds both sections, the same way one array holds the ideas of both prose
 * sections. A second field per section would make adding a third one a migration rather
 * than a row in the table above.
 */
export function linksIn(study: OpeningStudy, section: StudyLinkSectionId): StudyLink[] {
  return study.links.filter(link => link.section === section)
}

/**
 * Move an idea one place up or down the list it is shown in.
 *
 * Within its own group — same section, same side, same rank — because that is the list
 * on screen. Swapping with whatever happens to be next in the flat array would move a
 * White plan past a Black one and look like nothing happened, since the two are drawn in
 * different columns.
 */
export function moveIdea(ideas: StudyIdea[], id: string, delta: number): StudyIdea[] {
  const idea = ideas.find(entry => entry.id === id)
  if (!idea) return ideas

  const siblings = ideas.filter(
    entry =>
      entry.section === idea.section &&
      entry.side === idea.side &&
      (entry.rank ?? 'main') === (idea.rank ?? 'main'),
  )

  const at = siblings.indexOf(idea)
  const target = siblings[at + delta]
  if (!target) return ideas

  // swap them where they actually sit, so the rest of the array is untouched
  const from = ideas.indexOf(idea)
  const to = ideas.indexOf(target)
  const next = [...ideas]
  next[from] = target
  next[to] = idea
  return next
}

/** Whether anything at all has been written. What decides if the field is worth storing. */
export function studyHasContent(study: OpeningStudy): boolean {
  return (
    study.ideas.some(idea => idea.text.trim().length > 0) ||
    study.links.length > 0 ||
    study.alsoReaches.length > 0
  )
}

/** How many ideas are written here — the figure the openings list shows per row. */
export function ideaCount(study: OpeningStudy | undefined): number {
  return (study?.ideas ?? []).filter(idea => idea.text.trim().length > 0).length
}

/**
 * A study in the shape Firestore will take.
 *
 * Every optional field is set or left out, never assigned `undefined` — an undefined
 * value rejects the whole document rather than the field, which is a save that fails for
 * a reason nothing on screen can explain. Empty ideas are dropped here rather than being
 * refused in the form: a bullet you started and left blank is not worth storing, and
 * deleting it out from under the cursor while you think would be worse.
 */
export function studyBody(study: OpeningStudy): OpeningStudy {
  const ideas = study.ideas
    .filter(idea => idea.text.trim().length > 0)
    .map(idea => {
      const next: StudyIdea = { id: idea.id, section: idea.section, text: idea.text.trim() }
      if (idea.side) next.side = idea.side
      if (idea.rank) next.rank = idea.rank

      const patternIds = (idea.patternIds ?? []).filter(id => id.length > 0)
      if (patternIds.length > 0) next.patternIds = patternIds

      const games = (idea.games ?? []).map(citation => {
        const cited: StudyCitation = { gameId: citation.gameId, shows: citation.shows }
        if (typeof citation.ply === 'number') cited.ply = citation.ply
        if (citation.note && citation.note.trim().length > 0) cited.note = citation.note.trim()
        return cited
      })
      if (games.length > 0) next.games = games

      return next
    })

  return {
    ideas,
    links: study.links
      .filter(link => link.url.trim().length > 0)
      .map(link => ({
        url: link.url.trim(),
        title: link.title.trim(),
        // the same fallback `normalizeStudy` applies, because the writer must not be able
        // to emit `section: undefined` — an undefined value rejects the whole document,
        // not the field, and the type being required is not the same as the value being
        // there on a study that reached here some other way
        section: link.section ?? 'references',
      })),
    alsoReaches: [...new Set(study.alsoReaches)],
  }
}

/**
 * Whether two studies differ, which is what "unsaved" means.
 *
 * Compared as JSON through `studyBody`, so what is compared is what would be written —
 * typing a space into an empty bullet is not an unsaved change. Both sides are built by
 * the same function, so the key order matches; a hand-written deep equal would be a
 * second definition of what a study is, and it would rot against this one.
 */
export function studyChanged(a: OpeningStudy, b: OpeningStudy): boolean {
  return JSON.stringify(studyBody(a)) !== JSON.stringify(studyBody(b))
}

/**
 * A stored study in the shape the code expects, whatever shape it was written in.
 *
 * Openings are the one collection that never had a normaliser — the read was a bare cast,
 * which was fine while the type was six required fields and is not now. An idea filed
 * under a section that no longer exists is dropped rather than passed through, the same
 * rule the shape filter follows: a hand-edited document must not be able to invent a
 * category the screen cannot draw.
 */
export function normalizeStudy(raw: unknown): OpeningStudy {
  if (!raw || typeof raw !== 'object') return emptyStudy()

  const stored = raw as Partial<OpeningStudy>
  const ideas = Array.isArray(stored.ideas) ? stored.ideas : []
  const links = Array.isArray(stored.links) ? stored.links : []
  const alsoReaches = Array.isArray(stored.alsoReaches) ? stored.alsoReaches : []

  return {
    ideas: ideas
      .filter(idea => idea && IDEA_SECTIONS.includes(idea.section))
      .map((idea, index) => ({
        ...idea,
        // an idea written before ids existed keeps its place rather than being thrown away
        id: idea.id || `idea-${index}`,
        text: typeof idea.text === 'string' ? idea.text : '',
      })),
    links: links
      .filter(link => link && typeof link.url === 'string' && link.url.length > 0)
      .map(link => ({
        url: link.url,
        title: typeof link.title === 'string' ? link.title : '',
        /*
         * Defaulted rather than dropped, which is the opposite of what an idea's section
         * does two lines up. An idea has always carried one, so an unknown value there is
         * a hand-edited document naming a category the screen cannot draw. A link
         * carrying none is *every* link written before this section existed, and throwing
         * those away would be deleting someone's references to make room for a field.
         */
        section: LINK_SECTIONS.includes(link.section) ? link.section : 'references',
      })),
    alsoReaches: alsoReaches.filter(id => typeof id === 'string'),
  }
}

/**
 * A lichess study URL turned into one that can be put in an iframe, or null.
 *
 * Lichess documents this under *Embed a chess analysis in your site*, and the embed is
 * per **chapter**: `/study/embed/{study}/{chapter}`. A study URL with no chapter in it
 * has nothing to show and the embed route answers 404, so it stays a link card — which
 * is rarely what you have anyway, since lichess puts the chapter in the address bar as
 * soon as you open one.
 *
 * The returned URL is *built* from parts that have been checked, rather than the pasted
 * string being rewritten and handed to an iframe: the host must be lichess, and both ids
 * must be the plain alphanumeric ones lichess mints. Anything else gets a link.
 *
 * `bg=dark` rather than the documented `auto`, because this app is dark whatever the
 * device is set to, and an embed that reads the system theme would come up white inside
 * a black page.
 */
export function lichessEmbed(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname.replace(/^www\./, '') !== 'lichess.org') return null

  const parts = parsed.pathname.split('/').filter(part => part.length > 0)
  // /study/{study}/{chapter}, or one that is already an embed
  const [head, ...rest] = parts
  if (head !== 'study') return null
  const ids = rest[0] === 'embed' ? rest.slice(1) : rest
  if (ids.length !== 2) return null
  if (!ids.every(id => /^[A-Za-z0-9]{6,12}$/.test(id))) return null

  return `https://lichess.org/study/embed/${ids[0]}/${ids[1]}?theme=brown&bg=dark`
}

/** The host a reference points at — what a link card is read by. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'link'
  }
}
