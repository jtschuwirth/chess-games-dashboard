'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Panel, { useFolded } from '@/components/Section'
import { errorText } from '@/components/PageShell'
import { getGames, getTagGroups, removeTagEverywhere, saveTagGroups, tagFootprint } from '@/lib/firestore'
import { unfiledTags } from '@/lib/review'
import {
  ADOPTED_GROUP,
  MAX_TAG_GROUPS,
  newTagId,
  tagIds,
  type TagGroup,
} from '@/lib/tags'
import type { GameRecord } from '@/types/chess'

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/**
 * Where the tag vocabulary is kept.
 *
 * The review form used to take any word typed into it, which is how `fork` and
 * `italian fork` ended up as two rows of the Mistake database describing one mistake.
 * Adding a tag is a deliberate act now, and this is where it is done.
 *
 * Three things make it safe to edit a list that history already points at:
 *
 * - **A tag's id never changes and its name always can.** Reviews store the id, so
 *   renaming reaches every entry at once with nothing rewritten and nothing to migrate.
 * - **Removing a tag removes it from every review**, which is the only honest reading of
 *   "delete" — a word struck off the list but still being counted would be worse than
 *   leaving it. It cannot be undone by adding the tag back, so it is confirmed against
 *   the number of entries it will touch.
 * - **Moving a tag between groups is free**, because the group is derived at read time
 *   and never stored on a review. Without it the only way to re-file a tag would be to
 *   delete it and lose the entries, which is a trap rather than a feature.
 *
 * Everything is a draft until Save, including the removals: nothing is written — not the
 * vocabulary, not a single review — until the button is pressed.
 */
const PANEL_ID = 'tag-vocabulary'

export default function TagGroupsPanel({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<TagGroup[] | null>(null)
  const [draft, setDraft] = useState<TagGroup[]>([])
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The tag or group whose removal is waiting for a second press. */
  const [confirming, setConfirming] = useState<string | null>(null)

  /*
   * The same fold state the Panel keeps, read a second time so the panel knows whether
   * it is on screen. The games are only fetched once it is, and that is the whole reason
   * for reading it: see the load below.
   */
  const [folded] = useFolded(PANEL_ID, true)

  const load = useCallback(
    () =>
      Promise.all([getTagGroups(userId), getGames(userId, { fresh: true })])
        .then(([groups, loadedGames]) => {
          setSaved(groups)
          setDraft(groups)
          setGames(loadedGames)
          setError(null)
        })
        .catch(caught => setError(errorText(caught, 'Could not load your tags.'))),
    [userId],
  )

  /*
   * Read fresh, and only once the panel is open.
   *
   * Fresh because this is the one screen that writes to many games at once: removing a
   * tag strips it from every review carrying it, and a cache missing a game written on
   * another device would quietly leave that one tagged — "deleted everywhere" has to
   * mean everywhere. It is also what the footprint on each ✕ is counted from, and a
   * number under a destructive button must not be a guess. The same reasoning as the
   * plans page and the study, which read fresh for far less than this.
   *
   * Only when open because fresh means a billed read per game, and this panel sits on a
   * page most visits are not about. Folded, it costs the one document the vocabulary is
   * in — and that is enough to show the count in its heading.
   */
  useEffect(() => {
    if (!folded) load()
  }, [folded, load])

  useEffect(() => {
    getTagGroups(userId)
      .then(groups => {
        setSaved(current => current ?? groups)
        setDraft(current => (current.length > 0 ? current : groups))
      })
      .catch(() => {})
  }, [userId])

  function edit(next: TagGroup[]) {
    setDraft(next)
    setDone(false)
    setConfirming(null)
  }

  /*
   * Which tags this save would delete outright.
   *
   * An id present before and absent now. A tag *moved* between groups keeps its id and
   * so is not in here, which is the whole reason moving had to be possible: otherwise
   * re-filing a tag would run the cascade and take the entries with it.
   */
  const removed = useMemo(() => {
    if (!saved) return []
    const keeping = tagIds(draft)
    return saved.flatMap(group => group.tags).filter(tag => !keeping.has(tag.id))
  }, [saved, draft])

  const cost = useMemo(() => {
    if (!games) return { games: 0, entries: 0 }
    return removed.reduce(
      (total, tag) => {
        const here = tagFootprint(games, tag.id)
        return { games: total.games + here.games, entries: total.entries + here.entries }
      },
      { games: 0, entries: 0 },
    )
  }, [games, removed])

  /** Tags written on your reviews that the draft does not offer. */
  const unfiled = useMemo(
    () => (games ? unfiledTags(games, draft) : []),
    [games, draft],
  )

  async function save() {
    setSaving(true)
    setError(null)
    try {
      /*
       * The reviews first, and only against a list that actually arrived.
       *
       * A vocabulary saved before the cascade ran would describe a state that does not
       * exist yet, and a failure between the two would leave the tag counted but
       * unlisted. Refusing without the games is the same care one level up: stripping a
       * tag from a list that is missing a game would report "removed everywhere" while
       * leaving it on that one.
       */
      if (removed.length > 0 && !games) {
        throw new Error('The reviews have not loaded, so a tag cannot be removed yet.')
      }

      for (const tag of removed) {
        await removeTagEverywhere(userId, games ?? [], tag.id)
      }

      const next = await saveTagGroups(userId, draft)
      setSaved(next)
      setDraft(next)
      setDone(true)
      // the games carry the stripped reviews now, so the footprints have to be re-read
      if (removed.length > 0) setGames(await getGames(userId, { fresh: true }))
    } catch (caught) {
      setError(errorText(caught, 'Could not save your tags.'))
    } finally {
      setSaving(false)
    }
  }

  /*
   * Compared against the draft as typed, not against what it would normalise to. An
   * empty group normalises away, so comparing the tidied version would leave Save
   * disabled the moment after "+ Add a group" — a button that does nothing when the
   * screen plainly changed reads as broken. The tidy happens on save, and what comes
   * back is what the draft becomes.
   */
  const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(draft)
  const total = draft.reduce((n, group) => n + group.tags.length, 0)

  return (
    <Panel
      id={PANEL_ID}
      title="Your tags"
      meta={saved === null ? 'loading…' : `${total} in ${draft.length} groups`}
      startFolded
    >
      {/*
        Both, not just the vocabulary. Every ✕ in here prints how many entries it would
        take the tag off, and a count rendered from games that have not arrived would read
        as zero — a destructive button quoting a number it does not have yet.
      */}
      {saved === null || games === null ? (
        <p className="text-xs text-zinc-600">Reading your tags and the reviews using them…</p>
      ) : (
        <>
          <p className="text-xs text-zinc-500 max-w-prose">
            The words the Mistake database counts. Renaming one renames it on every review
            already carrying it; removing one takes it off them.
          </p>

          <div className="grid md:grid-cols-2 gap-3">
            {draft.map((group, groupIndex) => (
              <div
                key={group.id}
                className="flex flex-col gap-2 border border-zinc-800 rounded-lg p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={group.name}
                    onChange={event =>
                      edit(
                        draft.map((entry, index) =>
                          index === groupIndex ? { ...entry, name: event.target.value } : entry,
                        ),
                      )
                    }
                    aria-label="Group name"
                    className={`${INPUT} flex-1 uppercase tracking-wide`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      confirming === group.id
                        ? edit(draft.filter((_, index) => index !== groupIndex))
                        : setConfirming(group.id)
                    }
                    className={`text-xs transition-colors shrink-0 ${
                      confirming === group.id
                        ? 'text-red-400 hover:text-red-300'
                        : 'text-zinc-600 hover:text-zinc-300'
                    }`}
                    title={
                      confirming === group.id
                        ? 'Removes the group and every tag in it'
                        : 'Remove this group'
                    }
                  >
                    {confirming === group.id ? 'Really remove?' : '✕'}
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  {group.tags.map((tag, tagIndex) => {
                    const footprint = tagFootprint(games, tag.id)
                    return (
                      <div key={tag.id} className="flex items-center gap-1.5">
                        <input
                          value={tag.name}
                          onChange={event =>
                            edit(
                              draft.map((entry, index) =>
                                index !== groupIndex
                                  ? entry
                                  : {
                                      ...entry,
                                      tags: entry.tags.map((one, at) =>
                                        at === tagIndex ? { ...one, name: event.target.value } : one,
                                      ),
                                    },
                              ),
                            )
                          }
                          aria-label={`Tag: ${tag.name}`}
                          className={`${INPUT} flex-1 min-w-0`}
                        />

                        {/*
                          The group is derived at read time and never stored on a review,
                          so moving a tag costs nothing and loses nothing. It is here so
                          that re-filing never has to go through delete.
                        */}
                        <select
                          value={groupIndex}
                          onChange={event => {
                            const to = Number(event.target.value)
                            if (to === groupIndex) return
                            edit(
                              draft.map((entry, index) =>
                                index === groupIndex
                                  ? { ...entry, tags: entry.tags.filter((_, at) => at !== tagIndex) }
                                  : index === to
                                    ? { ...entry, tags: [...entry.tags, tag] }
                                    : entry,
                              ),
                            )
                          }}
                          aria-label={`Move ${tag.name} to another group`}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg pl-1.5 py-1.5 text-xs text-zinc-500 outline-none focus:border-zinc-600 shrink-0"
                          title={`In ${group.name} — pick another group to move it`}
                        >
                          {/*
                            The current group is drawn as the control's own icon rather
                            than as its name: a select narrow enough to sit on a tag row
                            shows one truncated letter, which reads as a rendering fault
                            rather than as a place to click. Open, it is group names.
                          */}
                          <option value={groupIndex}>⇄</option>
                          {draft.map((entry, index) =>
                            index === groupIndex ? null : (
                              <option key={entry.id} value={index}>
                                {entry.name}
                              </option>
                            ),
                          )}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            confirming === tag.id
                              ? edit(
                                  draft.map((entry, index) =>
                                    index === groupIndex
                                      ? {
                                          ...entry,
                                          tags: entry.tags.filter((_, at) => at !== tagIndex),
                                        }
                                      : entry,
                                  ),
                                )
                              : setConfirming(tag.id)
                          }
                          className={`text-xs transition-colors shrink-0 ${
                            confirming === tag.id
                              ? 'text-red-400 hover:text-red-300'
                              : 'text-zinc-600 hover:text-zinc-300'
                          }`}
                          title={
                            footprint.entries === 0
                              ? 'Remove this tag — it is on no reviews'
                              : `Remove this tag — it is on ${footprint.entries} ${
                                  footprint.entries === 1 ? 'entry' : 'entries'
                                } in ${footprint.games} ${footprint.games === 1 ? 'game' : 'games'}`
                          }
                        >
                          {confirming === tag.id
                            ? footprint.entries === 0
                              ? 'Remove?'
                              : `Remove from ${footprint.entries}?`
                            : '✕'}
                        </button>
                      </div>
                    )
                  })}
                </div>

                <AddTag
                  onAdd={name =>
                    edit(
                      draft.map((entry, index) =>
                        index === groupIndex
                          ? { ...entry, tags: [...entry.tags, { id: newTagId(), name }] }
                          : entry,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>

          {draft.length < MAX_TAG_GROUPS && (
            <button
              type="button"
              onClick={() => edit([...draft, { id: newTagId(), name: 'New group', tags: [] }])}
              className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              + Add a group
            </button>
          )}

          {/*
            Tags sitting on reviews that the vocabulary does not offer. Everything written
            by hand before there was a vocabulary lands here, which is how it gets in
            without the app's own seed carrying one person's words.
          */}
          {unfiled.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs uppercase tracking-wide text-zinc-500">
                  Written on your reviews, not in your list
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const adopted = unfiled.map(entry => ({ id: entry.tag, name: entry.tag }))
                    const at = draft.findIndex(group => group.name === ADOPTED_GROUP)
                    edit(
                      at >= 0
                        ? draft.map((group, index) =>
                            index === at ? { ...group, tags: [...group.tags, ...adopted] } : group,
                          )
                        : [...draft, { id: newTagId(), name: ADOPTED_GROUP, tags: adopted }],
                    )
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Add all to {ADOPTED_GROUP}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {unfiled.map(entry => (
                  <div key={entry.tag} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-300 truncate">{entry.tag}</span>
                    <span className="text-zinc-600 shrink-0">
                      {entry.count} {entry.count === 1 ? 'entry' : 'entries'}
                    </span>
                    <select
                      value=""
                      onChange={event => {
                        const to = Number(event.target.value)
                        if (!Number.isInteger(to)) return
                        edit(
                          draft.map((group, index) =>
                            index === to
                              ? {
                                  ...group,
                                  tags: [...group.tags, { id: entry.tag, name: entry.tag }],
                                }
                              : group,
                          ),
                        )
                      }}
                      aria-label={`Add ${entry.tag} to a group`}
                      className="ml-auto bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-500 outline-none focus:border-zinc-600"
                    >
                      <option value="">add to…</option>
                      {draft.map((group, index) => (
                        <option key={group.id} value={index}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {removed.length > 0 && (
            <p className="text-xs text-red-400/90 max-w-prose">
              Saving removes {removed.length === 1 ? '' : removed.length + ' tags: '}
              {removed.map(tag => tag.name).join(', ')}
              {cost.entries > 0
                ? ` — and takes ${cost.entries === 1 ? 'it' : 'them'} off ${cost.entries} ${
                    cost.entries === 1 ? 'entry' : 'entries'
                  } in ${cost.games} ${cost.games === 1 ? 'game' : 'games'}. That cannot be undone.`
                : `, which ${removed.length === 1 ? 'is' : 'are'} on no reviews.`}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="px-4 py-2 text-xs rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save tags'}
            </button>
            {done && <span className="text-xs text-emerald-400">Saved</span>}
            {dirty && !saving && (
              <button
                type="button"
                onClick={() => {
                  setDraft(saved)
                  setConfirming(null)
                  setDone(false)
                }}
                className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Discard changes
              </button>
            )}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </>
      )}
    </Panel>
  )
}

/** One box that adds a tag and clears itself, so a group can be filled out in a run. */
function AddTag({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('')

  function commit() {
    const name = value.trim()
    if (name.length === 0) return
    onAdd(name)
    setValue('')
  }

  return (
    <input
      value={value}
      onChange={event => setValue(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        commit()
      }}
      onBlur={commit}
      placeholder="add a tag and press Enter"
      className={`${INPUT} w-full`}
    />
  )
}
