'use client'

import Chip from '@/components/Chip'
import { tagName, type TagGroup } from '@/lib/tags'

/**
 * Your vocabulary, picked for one entry.
 *
 * Lifted out of the review form when move notes needed the same control: two copies of
 * this list would be two vocabularies the first time one of them was edited.
 *
 * **There is no free-text box any more**, and its absence is the feature. Anything typed
 * into it became a tag, so the list grew a near-duplicate every time a word was reached
 * for rather than picked — `fork` beside `italian fork`, each counted separately, neither
 * total true about either. Adding a tag is now a deliberate act on the profile page,
 * which is the difference between a vocabulary and a pile of words.
 *
 * What is stored is the tag's **id**; what is drawn is its current name. That is what
 * lets a tag be renamed once and read correctly on every review already carrying it.
 *
 * Open state is the caller's, held per entry rather than derived from "has no tags yet" —
 * derived, picking the first tag closed the picker under you, and tagging a move usually
 * takes more than one.
 */
export default function TagPicker({
  tags,
  open,
  onToggleOpen,
  onChange,
  patternTags,
  groups,
}: {
  /** Tag ids, as stored on the review. */
  tags: string[]
  open: boolean
  onToggleOpen: () => void
  onChange: (tags: string[]) => void
  /**
   * Your written-up patterns, offered as their own group above the vocabulary. A
   * pattern's name is its tag, so picking one here is what connects an entry to the
   * thing you wrote — and the name is its own id, which is why these need no lookup.
   */
  patternTags: string[]
  /** The account's vocabulary. */
  groups: TagGroup[]
}) {
  const toggle = (id: string) =>
    onChange(tags.includes(id) ? tags.filter(entry => entry !== id) : [...tags, id])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 flex-wrap">
        {tags.length === 0 && <span className="text-xs text-zinc-600">Nothing tagged yet.</span>}
        {tags.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(tags.filter(entry => entry !== id))}
            className="px-2.5 py-1 text-xs rounded-full bg-zinc-200 text-zinc-900 hover:bg-white transition-colors"
            title="Remove this tag"
          >
            {tagName(id, groups)} ✕
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

          {groups.map(group => (
            <div key={group.id} className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-zinc-500">{group.name}</span>
              <div className="flex gap-1 flex-wrap">
                {group.tags.map(tag => (
                  <Chip key={tag.id} active={tags.includes(tag.id)} onClick={() => toggle(tag.id)}>
                    {tag.name}
                  </Chip>
                ))}
              </div>
            </div>
          ))}

          {/*
            Tags on this entry that the vocabulary no longer offers. Shown rather than
            dropped, because the entry says what you thought at the time and this is the
            only place it can be taken off — and a tag that vanished from the form while
            staying on the review would read as the form being broken.
          */}
          {tags.some(id => !patternTags.includes(id) && !groups.some(g => g.tags.some(t => t.id === id))) && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                Not in your vocabulary
              </span>
              <div className="flex gap-1 flex-wrap">
                {tags
                  .filter(
                    id => !patternTags.includes(id) && !groups.some(g => g.tags.some(t => t.id === id)),
                  )
                  .map(id => (
                    <Chip key={id} active onClick={() => toggle(id)}>
                      {id}
                    </Chip>
                  ))}
              </div>
              <span className="text-xs text-zinc-600">
                Add it on the profile page to use it again, or click to take it off.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
