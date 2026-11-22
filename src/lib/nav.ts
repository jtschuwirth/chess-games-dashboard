/**
 * The sections of the app, in one list, because three screens were naming them.
 *
 * The home page had a table of nine cards; the back link at the top of every detail page
 * was a hardcoded `← All patterns`; and nothing anywhere knew what the other sections
 * were called. So a game opened from `/uploads` said `← Dashboard`, which is not where
 * you came from, and getting from a plan to the mistakes dashboard was two steps through
 * Home.
 *
 * One table serves all three: the menu that hangs off every header, the home page's own
 * cards, and the rule that works out what `← Back` should say.
 */

export interface NavSection {
  /** The section's own page, and the prefix every page inside it starts with. */
  href: string
  /** What the home page calls it. */
  title: string
  /** What a back link and the menu call it, where the full title is too long. */
  short: string
  icon: string
  description: string
  /**
   * Whether this section reads the dashboard filter query string.
   *
   * Returning to one means handing the slice back, or Back would land on the page you
   * came from showing something else — which is the same as not going back at all.
   */
  filtered?: boolean
}

export const NAV_SECTIONS: NavSection[] = [
  {
    href: '/dashboard',
    title: 'Dashboard',
    short: 'Dashboard',
    icon: '📊',
    description: 'Win / draw / loss splits, overall or per saved line',
    filtered: true,
  },
  {
    href: '/mistakes',
    title: 'Mistakes',
    short: 'Mistakes',
    icon: '⚠️',
    description: 'Every marked move, what kind it was, and where on the board they land',
    filtered: true,
  },
  {
    href: '/openings',
    title: 'Openings',
    short: 'Openings',
    icon: '📖',
    description: 'Save the lines you play and name them',
  },
  {
    href: '/studies',
    title: 'Studies',
    short: 'Studies',
    icon: '📚',
    description: 'Write up an opening, a structure, an ending — and link the rest to it',
  },
  {
    href: '/patterns',
    title: 'Patterns',
    short: 'Patterns',
    icon: '🧩',
    description: 'Write up the ideas you keep missing, and tag mistakes with them',
  },
  {
    href: '/models',
    title: 'Model games',
    short: 'Models',
    icon: '♟️',
    description: 'Games somebody else played, commented move by move and cited from a study',
  },
  {
    href: '/guides',
    title: 'Exercise guides',
    short: 'Guides',
    icon: '📄',
    description: 'A coach’s sheet of positions, solved on a board and written up',
  },
  {
    href: '/plans',
    title: 'Study plans',
    short: 'Plans',
    icon: '🗓️',
    description: 'Weeks of practice, counted off, with that day’s games beside them',
  },
  {
    href: '/learn',
    title: 'Learn from your mistakes',
    short: 'Learn',
    icon: '🎯',
    description: 'Find the move again in the positions you got wrong',
    filtered: true,
  },
  {
    href: '/daily',
    title: 'Daily games',
    short: 'Daily',
    icon: '🧠',
    description: 'Run the move loop move by move, written down as you go',
  },
  {
    href: '/uploads',
    title: 'Uploaded games',
    short: 'Uploads',
    icon: '📥',
    description: 'Paste a PGN in, and set the clock a brought-in game was played at',
  },
  {
    href: '/profile',
    title: 'Profile',
    short: 'Profile',
    icon: '🔗',
    description: 'Link your chess.com and lichess accounts, and set how games are read',
  },
]

/**
 * Which section a path belongs to — the longest href that owns it.
 *
 * Longest rather than first, so `/patterns/drill` is Patterns and not whatever happens to
 * come earlier in the list. A path that matches nothing belongs to no section, which is
 * how a `from` nobody wrote is told from one that was.
 */
export function sectionOf(path: string): NavSection | null {
  let best: NavSection | null = null
  for (const section of NAV_SECTIONS) {
    if (path === section.href || path.startsWith(`${section.href}/`)) {
      if (!best || section.href.length > best.href.length) best = section
    }
  }
  return best
}

/**
 * Where a link says it came from, as one query parameter.
 *
 * A path and nothing else — no host, no query, no `//` that a browser would read as a
 * host. What comes back out is checked against the table rather than trusted, so a
 * hand-typed `?from=https://elsewhere` names no section and the page falls back to where
 * it would have gone anyway.
 */
export function fromParam(path: string): string {
  return `from=${encodeURIComponent(path)}`
}

/** Adds the caller's own page to a link, so what it opens knows the way back. */
export function withFrom(href: string, from: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}${fromParam(from)}`
}

export function readFrom(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return sectionOf(raw) ? raw : null
}

export interface BackTarget {
  href: string
  label: string
}

/**
 * What `← Back` should say and where it should go.
 *
 * `from` wins when it names a real section, because that is the page you were actually
 * on; the fallback is what the page would have said on its own — `All patterns` from a
 * write-up — for a link somebody typed or an old one somebody saved.
 *
 * `search` is the dashboard's filter query, handed back only to the sections that read
 * it. Arriving at the dashboard with the filters cleared is not returning to the slice
 * you left.
 */
export function backTarget(
  from: string | null,
  fallback: BackTarget,
  search = '',
): BackTarget {
  const path = readFrom(from)
  if (!path) return fallback

  const section = sectionOf(path)!
  const href = section.filtered && path === section.href ? `${path}${search}` : path
  return { href, label: section.short }
}
