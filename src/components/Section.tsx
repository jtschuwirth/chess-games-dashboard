'use client'

import { useSyncExternalStore } from 'react'

/**
 * Folding a dashboard panel away, and keeping it folded.
 *
 * The dashboard is a long page where most visits are about one thing — the clock, or the
 * mistake table, or the game list — and everything else is scrolling. The control is the
 * same `+`/`−` a review entry has, with one difference: a review is a form you fill once,
 * while the dashboard is a page you open daily, so the state outlives the visit.
 *
 * It is a hook and a button rather than a wrapper component, because every panel already
 * owns its own box and heading. A wrapper would have had to either duplicate those or
 * strip them out of five files; this way the button goes where the heading already is,
 * exactly as it does in a review entry.
 *
 * The state lives in localStorage, which makes it the "external mutable store" case:
 * prerendering cannot see it and nothing in React owns it. Hence `useSyncExternalStore`
 * with a server snapshot of "open" — the same reasoning as the engine mode toggle —
 * rather than reading it into state in an effect, which would both flash and trip the
 * set-state-in-effect rule.
 */
const KEY = 'dashboard-folded'

/**
 * What each panel has been set to, by id. A panel with no entry has never been touched
 * and falls back to its own default.
 *
 * It was a plain set of the folded ids, which could only say "folded", and so could not
 * express a panel that starts folded and has been opened. The old array is converted on
 * read rather than migrated — the same habit as every stored shape here — and the first
 * fold rewrites the key.
 */
let state: Record<string, boolean> | null = null
const listeners = new Set<() => void>()

function read(): Record<string, boolean> {
  if (state) return state

  state = {}
  try {
    const stored = window.localStorage.getItem(KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : null

    if (Array.isArray(parsed)) {
      for (const id of parsed) if (typeof id === 'string') state[id] = true
    } else if (parsed && typeof parsed === 'object') {
      state = parsed as Record<string, boolean>
    }
  } catch {
    // private window, blocked storage, or something else wrote nonsense under the key
  }
  return state
}

function write(next: Record<string, boolean>): void {
  state = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // the choice just will not outlive the tab
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Whether this panel is folded, and how to turn it over.
 *
 * `startFolded` is what a panel does before anyone has an opinion about it. Most start
 * open; one that is there for the times you need it rather than for reading starts shut.
 *
 * The snapshot is a boolean rather than the record, which is what keeps
 * `useSyncExternalStore` stable: a fresh object out of the snapshot would loop for ever.
 */
export function useFolded(id: string, startFolded = false): [boolean, () => void] {
  const isFolded = useSyncExternalStore(
    subscribe,
    () => (typeof window === 'undefined' ? startFolded : (read()[id] ?? startFolded)),
    () => startFolded,
  )

  return [isFolded, () => write({ ...read(), [id]: !isFolded })]
}

/** The `+`/`−` itself, so every panel's reads and behaves the same. */
export function FoldButton({
  folded: isFolded,
  onToggle,
  label,
}: {
  folded: boolean
  onToggle: () => void
  /** The panel's name, for the tooltip and for screen readers. */
  label: string
}) {
  const text = isFolded ? `Open ${label}` : `Fold ${label} away`

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isFolded}
      title={text}
      aria-label={text}
      className="w-5 h-5 shrink-0 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 transition-colors leading-none"
    >
      {isFolded ? '+' : '−'}
    </button>
  )
}

/**
 * A dashboard panel: one box, one heading, one fold control, one body.
 *
 * The dashboard grew a section at a time and ended up with three heading styles, two
 * paddings and four of nine panels with no box at all — each one defensible on its own
 * and incoherent together. This is the only shape now, so a new panel cannot invent a
 * fourth.
 *
 * `meta` is the figure that belongs to the panel as a whole — "18 games analysed at
 * depth 21" — and stays visible while the panel is folded, because that is usually the
 * line you folded it down to. `actions` sits at the end for the controls that act on it.
 */
export default function Panel({
  id,
  title,
  meta,
  actions,
  startFolded,
  children,
}: {
  /** Stable key for the remembered fold state. */
  id: string
  title: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  /** What it does until someone folds or opens it themselves. */
  startFolded?: boolean
  children: React.ReactNode
}) {
  const [folded, toggle] = useFolded(id, startFolded)

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
        <FoldButton folded={folded} onToggle={toggle} label={title} />
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {meta && <span className="text-xs text-zinc-500 min-w-0">{meta}</span>}
        {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {!folded && <div className="px-5 pb-5 flex flex-col gap-4">{children}</div>}
    </section>
  )
}
