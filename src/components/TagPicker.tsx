'use client'

import Chip from '@/components/Chip'
import { TAG_GROUPS } from '@/lib/review'

/**
 * The shared vocabulary, picked for one entry.
 *
 * Lifted out of the review form when move notes needed the same control: the fixed
 * groups, your patterns above them and your own additions below are what make a count
 * comparable across months, and two copies of that list would be two vocabularies the
 * first time one of them was edited.
 *
 * Open state is the caller's, held per entry rather than derived from "has no tags
 * yet" — derived, picking the first tag closed the picker under you, and tagging a
 * move usually takes more than one.
 */
export default function TagPicker({
  tags,
  open,
  onToggleOpen,
  onChange,
  patternTags,
  suggestedTags,
}: {
  tags: string[]
  open: boolean
  onToggleOpen: () => void
  onChange: (tags: string[]) => void
  /**
   * Your written-up patterns, offered as their own group above the fixed vocabulary.
   * A pattern's name is its tag, so picking one here is what connects an entry to the
   * thing you wrote.
   */
  patternTags: string[]
  /** Tags you have invented elsewhere, offered back for consistency. */
  suggestedTags: string[]
}) {
  const toggle = (tag: string) =>
    onChange(tags.includes(tag) ? tags.filter(entry => entry !== tag) : [...tags, tag])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 flex-wrap">
        {tags.length === 0 && <span className="text-xs text-zinc-600">Nothing tagged yet.</span>}
        {tags.map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => onChange(tags.filter(entry => entry !== tag))}
            className="px-2.5 py-1 text-xs rounded-full bg-zinc-200 text-zinc-900 hover:bg-white transition-colors"
            title="Remove this tag"
          >
            {tag} ✕
          </button>
        ))}
      </div>

      {/*
        A plain button rather than <details>: React nulls `currentTarget` on a toggle
        event, and reading it there crashed the page.
      */}
      <button
        type="button"
        onClick={onToggleOpen}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors self-start"
      >
        {open ? '▾ Hide tags' : '▸ Pick tags'}
      </button>

      {open && (
        <div className="grid sm:grid-cols-2 gap-3">
          {patternTags.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Patterns</span>
              <div className="flex gap-1 flex-wrap">
                {patternTags.map(tag => (
                  <Chip key={tag} active={tags.includes(tag)} onClick={() => toggle(tag)}>
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {TAG_GROUPS.map(group => (
            <div key={group.name} className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-zinc-500">{group.name}</span>
              <div className="flex gap-1 flex-wrap">
                {group.tags.map(tag => (
                  <Chip key={tag} active={tags.includes(tag)} onClick={() => toggle(tag)}>
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Your own</span>
            <div className="flex gap-1 flex-wrap">
              {suggestedTags.map(tag => (
                <Chip key={tag} active={tags.includes(tag)} onClick={() => toggle(tag)}>
                  {tag}
                </Chip>
              ))}
            </div>
            <input
              placeholder="add a tag and press Enter"
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                event.preventDefault()

                const value = event.currentTarget.value.trim().toLowerCase()
                if (value.length === 0 || tags.includes(value)) return

                onChange([...tags, value])
                event.currentTarget.value = ''
              }}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600"
            />
          </div>
        </div>
      )}
    </div>
  )
}
