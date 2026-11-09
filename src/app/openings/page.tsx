'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import OpeningForm from '@/components/OpeningForm'
import { deleteOpening, getGames, getOpenings, saveOpening, updateOpening } from '@/lib/firestore'
import {
  buildOpeningTree,
  flattenTree,
  formatMoves,
  gameMatchesNode,
  normalizeOpening,
  type OpeningNode,
} from '@/lib/opening'
import { positionKeyMap } from '@/lib/scope'
import { ideaCount } from '@/lib/study'
import { COLOR_LABEL, type GameRecord, type NewOpeningLine, type OpeningLine } from '@/types/chess'

function OpeningsBody({ userId }: { userId: string }) {
  const [openings, setOpenings] = useState<OpeningLine[] | null>(null)
  const [games, setGames] = useState<GameRecord[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * The lines first, the games after.
   *
   * They used to arrive together in one `Promise.all`, which meant the list waited on
   * a thousand game documents to show sixty-five saved lines — and then blocked paint
   * again replaying every one of them. The counts are a figure you glance at; the
   * tree is the page. So the tree renders as soon as it can and the counts appear
   * when they are ready.
   */
  const load = useCallback(() => {
    const lines = getOpenings(userId).then(loaded => {
      setOpenings(loaded)
      setError(null)
    })

    getGames(userId)
      .then(setGames)
      // a failed game read costs the counts, not the page
      .catch(() => setGames([]))

    return lines.catch(caught =>
      setError(errorText(caught, 'Could not load your saved openings.')),
    )
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const tree = useMemo(() => buildOpeningTree(openings ?? []), [openings])
  const rows = useMemo(() => flattenTree(tree), [tree])

  /**
   * How many games each line covers, so the list answers "where are my games" without
   * opening every study. The dashboard's own rule, so the two can never disagree.
   *
   * The cost here is the replay inside `positionKeyMap`, not the matching: a thousand
   * games through chess.js, a FEN per ply. Rewriting the matching to walk each game
   * once instead of asking each node about each game was measured against this on the
   * real data — identical counts on all 65 lines, and 20% *slower*. So the simple
   * version stays, and what makes the page usable is that the lines no longer wait
   * for the games at all.
   */
  const counts = useMemo(() => {
    const keys = positionKeyMap(games)
    const map = new Map<string, number>()

    const walk = (nodes: OpeningNode[]) => {
      for (const node of nodes) {
        map.set(
          node.opening.id,
          games.filter(game => gameMatchesNode(game, keys.get(game.id) ?? new Map(), node)).length,
        )
        walk(node.children)
      }
    }

    walk(tree)
    return map
  }, [games, tree])
  const editing = openings?.find(opening => opening.id === editingId) ?? null

  async function handleSubmit(opening: NewOpeningLine) {
    setError(null)
    if (editingId) {
      await updateOpening(userId, editingId, opening)
      // through the reader, so the row on screen is the row a reload would draw — it is
      // where `keys` comes from, and a bare spread would leave the edited line matching
      // whatever it matched before
      setOpenings(prev =>
        (prev ?? []).map(item =>
          item.id === editingId ? normalizeOpening({ ...opening, id: editingId }) : item,
        ),
      )
      setEditingId(null)
      return
    }

    const id = await saveOpening(userId, opening)
    setOpenings(prev => [...(prev ?? []), normalizeOpening({ ...opening, id })])
  }

  async function handleDelete(openingId: string) {
    setError(null)
    try {
      await deleteOpening(userId, openingId)
    } catch (caught) {
      setError(errorText(caught, 'Could not delete that opening.'))
      return
    }
    setOpenings(prev => (prev ?? []).filter(opening => opening.id !== openingId))
    if (editingId === openingId) setEditingId(null)
  }

  return (
    <>
      <OpeningForm
        key={editingId ?? 'new'}
        initial={editing}
        others={(openings ?? []).filter(opening => opening.id !== editingId)}
        onSubmit={handleSubmit}
        onCancel={editingId ? () => setEditingId(null) : undefined}
      />

      {error && <LoadError message={error} onRetry={load} />}

      {openings === null ? (
        <div className="py-16 flex justify-center">
          <Spinner size="w-6 h-6" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-zinc-500">
          No openings saved yet — add your first line above.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
          {rows.map(({ opening, depth, children }) => (
            <div
              key={opening.id}
              className={`flex items-start gap-4 px-5 py-4 transition-colors group ${
                opening.id === editingId ? 'bg-zinc-800' : 'bg-zinc-900 hover:bg-zinc-800'
              }`}
            >
              {/* the row is the way in to the study; Edit and delete stay outside the
                  link, because a button inside an anchor is both invalid and unusable */}
              <Link
                href={`/openings/${opening.id}`}
                className="flex-1 min-w-0"
                style={{ paddingLeft: depth * 20 }}
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  {depth > 0 && <span className="text-zinc-600 text-xs">↳</span>}
                  <span className="font-medium text-sm">{opening.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                    {COLOR_LABEL[opening.color]}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {opening.ply} half-moves
                    {/*
                      Other ways in are a count here rather than rows: they are the same
                      opening, so listing them would be the self-nesting they replaced.
                    */}
                    {opening.alts &&
                      opening.alts.length > 0 &&
                      ` · ${opening.alts.length} other way${opening.alts.length === 1 ? '' : 's'} in`}
                    {children.length > 0 &&
                      ` · ${children.length} sub-variation${children.length === 1 ? '' : 's'}`}
                  </span>
                  {ideaCount(opening.study) > 0 && (
                    <span
                      title="Written up"
                      className="text-xs px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/15 text-sky-300"
                    >
                      ✎ {ideaCount(opening.study)}
                    </span>
                  )}
                  {(counts.get(opening.id) ?? 0) > 0 && (
                    <span className="text-xs text-zinc-600">
                      {counts.get(opening.id)} game{counts.get(opening.id) === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 font-mono mt-1 break-words">
                  {formatMoves(opening.moves)}
                </div>
              </Link>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setEditingId(opening.id)}
                  className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(opening.id)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-lg leading-none"
                  title="Delete opening"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default function OpeningsPage() {
  return <PageShell title="Openings">{user => <OpeningsBody userId={user.uid} />}</PageShell>
}
