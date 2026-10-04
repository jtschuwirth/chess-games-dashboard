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

let folded: Set<string> | null = null
const listeners = new Set<() => void>()

function read(): Set<string> {
  if (folded) return folded

  folded = new Set()
  try {
    const stored = window.localStorage.getItem(KEY)
    if (stored) folded = new Set(JSON.parse(stored) as string[])
  } catch {
    // private window, blocked storage, or something else wrote nonsense under the key
  }
  return folded
}

function write(next: Set<string>): void {
  folded = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    // the choice just will not outlive the tab
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function toggleId(id: string): void {
  const next = new Set(read())
  if (next.has(id)) next.delete(id)
  else next.add(id)
  write(next)
}

/**
 * Whether this panel is folded, and how to turn it over.
 *
 * The snapshot is a boolean rather than the Set, which is what keeps
 * `useSyncExternalStore` stable: the Set is only replaced on a toggle, and a fresh
 * object out of the snapshot would loop for ever.
 */
export function useFolded(id: string): [boolean, () => void] {
  const isFolded = useSyncExternalStore(
    subscribe,
    () => (typeof window === 'undefined' ? false : read().has(id)),
    () => false,
  )

  return [isFolded, () => toggleId(id)]
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
