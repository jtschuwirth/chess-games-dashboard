/**
 * The tag vocabulary, which belongs to the account rather than to the code.
 *
 * A tag is the unit the Mistake database counts, the tag filter slices by and the drill
 * reports on, and all three are only worth reading if the words hold still. That is what
 * a fixed list bought and what free text quietly took away again: anything typed into the
 * review form became a tag, so `fork` and `italian fork` counted as two different things
 * and neither total was the truth about either. A vocabulary you extend by typing is a
 * vocabulary that drifts.
 *
 * So the list is still fixed at the moment you use it — and you are the one who fixes it.
 * `DEFAULT_TAG_GROUPS` is the seed; the maintainer on the profile page is where they are
 * edited, and what you save is stored on your own user document. Two people using this
 * app are not obliged to agree about what went wrong in a game.
 */

/**
 * One tag: a name you can change and an id you cannot.
 *
 * Reviews store the **id**, so renaming a tag renames it on every entry already carrying
 * it, with nothing rewritten — the name is looked up at the point of display and nowhere
 * else. That is the whole reason for splitting them. It is the opposite bargain to a
 * pattern's name, which *is* its tag and so leaves the old string behind when renamed;
 * the difference is that a pattern is a document you wrote and a tag is a word in a list,
 * and a word in a list is exactly the kind of thing you fix the spelling of.
 */
export interface Tag {
  /** Stable for the life of the tag. What a review stores. */
  id: string
  /** What it is called now. Changing it reaches every review at once. */
  name: string
}

export interface TagGroup {
  id: string
  name: string
  tags: Tag[]
}

/**
 * The seed, in the shape it is easiest to read: a group name and its tags as plain words.
 *
 * **Each seeded tag's id is the word itself**, and that is load-bearing rather than lazy.
 * Every review ever written stored exactly these strings, so a vocabulary built this way
 * arrives with every existing entry already pointing at the right tag — no migration, no
 * backfill, no read-time mapping table, and the ids stay readable in a `?tag=` link.
 * Rename `fork` to `a fork I missed` and its id is still `fork`, which is what the 33
 * reviews that mention it are carrying.
 */
const SEED: { name: string; tags: string[] }[] = [
  {
    name: 'Tactics missed',
    tags: [
      'hanging piece',
      'hanging pawn',
      'fork',
      'pin',
      'skewer',
      'discovered attack',
      'back rank',
      'removing the defender',
      'overloaded defender',
      'trapped piece',
      'mate threat',
      'in-between move',
    ],
  },
  {
    name: 'Tactics allowed',
    tags: [
      'hung a piece',
      'hung a pawn',
      'allowed a fork',
      'allowed a pin',
      'allowed a skewer',
      'allowed a discovered attack',
      'allowed back rank mate',
      'my defender was removed',
      'my defender was overloaded',
      'let a piece get trapped',
      'allowed a mate threat',
    ],
  },
  {
    name: 'Calculation',
    tags: [
      "missed opponent's reply",
      // three ways a search can fail, and they are not the same failure: the move was
      // never a candidate, it was a candidate and got cut while it was still good, or
      // the whole think ended before it was finished
      'never considered the move',
      'abandoned a good line',
      'stopped calculating too early',
      'skipped checks and captures',
      'miscounted material',
      'lost track of the position',
      // both directions: answering a threat that was never real, or making one and
      // believing in it yourself
      'empty threat',
    ],
  },
  {
    name: 'Strategy',
    tags: [
      'wrong plan',
      // what the position was actually about, which is the judgement every plan rests
      // on: get this wrong and the plan can be carried out perfectly and still be the
      // wrong game
      "misjudged the position's main idea",
      'weakened my king',
      'pawn structure',
      'conceded a square',
      'wrong piece traded',
      'misplaced piece',
      'premature pawn push',
      'opened the position badly',
      "ignored opponent's plan",
    ],
  },
  {
    name: 'Endgame',
    tags: ['king activity', 'pawn race', 'conversion technique', 'wrong trade into the endgame'],
  },
  {
    name: 'Opening',
    tags: ['out of book', 'forgot the theory', 'wrong move order'],
  },
  {
    name: 'Mindset',
    tags: [
      'played too fast',
      'time pressure',
      'autopilot move',
      'impatient',
      'overconfident while winning',
      'panicked while worse',
      'rattled by a surprise',
    ],
  },
]

export const DEFAULT_TAG_GROUPS: TagGroup[] = SEED.map(group => ({
  id: group.name.toLowerCase().replace(/[^a-z]+/g, '-'),
  name: group.name,
  tags: group.tags.map(tag => ({ id: tag, name: tag })),
}))

/** Where a tag found on a review but missing from the vocabulary is offered a home. */
export const ADOPTED_GROUP = 'Your own'

/** Past this the picker is a wall rather than a list, and nothing is findable in it. */
export const MAX_TAG_GROUPS = 12

/** Enough for any vocabulary worth keeping, and a ceiling on the document's size. */
export const MAX_TAGS = 250

/** What a tag the vocabulary no longer offers is filed under. */
export const UNFILED = 'Unfiled'

/** What a tag naming one of your written-up patterns is filed under. */
export const PATTERN_GROUP = 'Pattern'

/**
 * An id for a tag or group you have just added.
 *
 * Random rather than derived from the name, which is the entire point: a name can be
 * edited and an id cannot, so an id spelled out of the name would change with it and
 * orphan every review carrying the old one. Called from an event handler and never from
 * a render, which is what the purity rule asks.
 */
export function newTagId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * A stored vocabulary in the shape the rest of the code expects.
 *
 * Two shapes are read. The one written here, and a group whose `tags` are plain strings —
 * which is how the vocabulary looked before a tag had an id, and is also what a
 * hand-edited document is most likely to contain. A bare string becomes `{ id: s, name: s }`,
 * which is the same rule the seed follows and means the two shapes describe the same
 * vocabulary. Normalise on read, never migrate: the habit `betterMovesOf` and the pre-game
 * ratings already follow.
 *
 * Ids are de-duplicated across the whole vocabulary rather than within a group, because
 * the id is the identity: one id in two groups would make `tagGroupOf` depend on which it
 * happened to scan first, and the Mistake database would file the same tag under whichever
 * answer came back. First occurrence wins.
 *
 * Names are deliberately left alone — not trimmed to uniqueness, not re-cased. The editor
 * writes through this on every keystroke, and a half-typed name must not be rearranged
 * under the cursor: that is the phase editor's lesson, and the tag picker's before it.
 */
export function normalizeTagGroups(raw: unknown): TagGroup[] {
  if (!Array.isArray(raw)) return DEFAULT_TAG_GROUPS

  const seen = new Set<string>()
  const out: TagGroup[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const group = entry as { id?: unknown; name?: unknown; tags?: unknown }

    const name =
      typeof group.name === 'string' && group.name.trim().length > 0
        ? group.name.trim()
        : `Group ${out.length + 1}`

    const tags: Tag[] = []
    for (const raw of Array.isArray(group.tags) ? group.tags : []) {
      // the older shape: the tag was its own identity, so it becomes both halves
      const tag =
        typeof raw === 'string'
          ? { id: raw.trim(), name: raw.trim() }
          : raw && typeof raw === 'object'
            ? {
                id: String((raw as Tag).id ?? '').trim(),
                name: String((raw as Tag).name ?? '').trim(),
              }
            : null

      if (!tag || tag.id.length === 0) continue
      if (seen.has(tag.id) || seen.size >= MAX_TAGS) continue

      seen.add(tag.id)
      // a tag whose name was cleared still has to be pickable, and its id is what it was
      tags.push({ id: tag.id, name: tag.name.length > 0 ? tag.name : tag.id })
    }

    // an empty heading in the picker is a row of nothing
    if (tags.length === 0) continue

    out.push({
      id: typeof group.id === 'string' && group.id.length > 0 ? group.id : newTagId(),
      name,
      tags,
    })
    if (out.length >= MAX_TAG_GROUPS) break
  }

  // a vocabulary that normalises to nothing would leave the review form with no tags
  return out.length > 0 ? out : DEFAULT_TAG_GROUPS
}

/**
 * The vocabulary in force, for the pure functions that would otherwise each need it
 * threaded through from the page that loaded it.
 *
 * The same shape as the analysis settings and the engine mode toggle: a module value, set
 * once when the account's document is read, with every function that uses it taking an
 * explicit argument that defaults to this.
 */
let current: TagGroup[] = DEFAULT_TAG_GROUPS

export function tagGroups(): TagGroup[] {
  return current
}

export function applyTagGroups(next: TagGroup[]): void {
  current = next
}

/**
 * Which group a tag belongs to.
 *
 * A tag naming one of your written-up patterns is a `Pattern`, which has to be passed in
 * because patterns are yours and this vocabulary is a different list of yours. Anything in
 * neither is `UNFILED` — written before the vocabulary offered it, or on a game synced
 * from an account whose vocabulary differs.
 *
 * A linear scan on purpose. A vocabulary is tens of strings and this is called once per
 * distinct tag in a tally, so an index would be a cache to invalidate in exchange for
 * nothing measurable.
 */
export function tagGroupOf(
  id: string,
  patternTags?: Set<string>,
  groups: TagGroup[] = current,
): string {
  for (const group of groups) {
    if (group.tags.some(tag => tag.id === id)) return group.name
  }
  return patternTags?.has(id) ? PATTERN_GROUP : UNFILED
}

/**
 * What to call a stored tag on screen.
 *
 * Falls back to the id, which is never a placeholder: a seeded tag's id is the word it
 * started as, and a pattern's tag is its name, so an id with no entry in the vocabulary
 * still reads as the thing it meant. That is what makes it safe to show a tag the
 * vocabulary has never heard of rather than hiding it.
 */
export function tagName(id: string, groups: TagGroup[] = current): string {
  for (const group of groups) {
    const found = group.tags.find(tag => tag.id === id)
    if (found) return found.name
  }
  return id
}

/** Every tag id the vocabulary offers. */
export function tagIds(groups: TagGroup[] = current): Set<string> {
  return new Set(groups.flatMap(group => group.tags.map(tag => tag.id)))
}
