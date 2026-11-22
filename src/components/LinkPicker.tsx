'use client'

import { useMemo, useState } from 'react'

export interface PickerItem {
  id: string
  label: string
  /** The line under the name — what tells two of them apart. */
  meta?: string
  /** A kind, a colour, a result: whatever the list is grouped by. */
  badge?: React.ReactNode
}

/**
 * Picking what a study points at, folded away until asked for.
 *
 * Every link on a study page is the same act — find the one you mean in a list of all of
 * them, press it, carry on — so it is one control rather than four. What differs is the
 * *rows already linked*, which each panel draws itself because a pattern row, a model
 * game row and a study row say different things and go to different pages.
 *
 * It is folded, the rule the pattern form's opening picker already follows: the list is
 * every pattern or every saved line you have, which on this account is sixty-odd, and it
 * is the tallest thing on a page that is mostly about something else. The search box
 * appears with it, because a list that long is searched rather than scrolled.
 */
export default function LinkPicker({
  items,
  selected,
  onToggle,
  addLabel,
  placeholder,
  empty,
}: {
  items: PickerItem[]
  selected: string[]
  onToggle: (id: string) => void
  /** What the control that opens it says: `+ Link a pattern`. */
  addLabel: string
  placeholder: string
  /** What to say when there is nothing to pick from at all. */
  empty: string
}) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')

  const shown = useMemo(() => {
    const needle = find.trim().toLowerCase()
    const matching =
      needle.length === 0
        ? items
        : items.filter(item =>
            `${item.label} ${item.meta ?? ''}`.toLowerCase().includes(needle),
          )

    // the ones already linked first, so pressing one twice to undo it does not mean
    // finding it again in a list of sixty
    return [...matching].sort(
      (a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)),
    )
  }, [items, find, selected])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
      >
        {addLabel}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <input
          value={find}
          onChange={event => setFind(event.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
        >
          Done
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-zinc-600">{empty}</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-zinc-600">Nothing matches that.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto flex flex-col divide-y divide-zinc-800/70">
          {shown.map(item => {
            const linked = selected.includes(item.id)

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className="text-left px-2 py-2 flex items-center gap-2 hover:bg-zinc-800/50 transition-colors"
              >
                <span
                  aria-hidden
                  className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px] leading-none ${
                    linked
                      ? 'bg-zinc-200 border-zinc-200 text-zinc-900'
                      : 'border-zinc-700 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1 flex flex-col">
                  <span className="text-sm text-zinc-200 truncate">{item.label}</span>
                  {item.meta && (
                    <span className="text-[11px] text-zinc-600 truncate">{item.meta}</span>
                  )}
                </span>
                {item.badge}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
