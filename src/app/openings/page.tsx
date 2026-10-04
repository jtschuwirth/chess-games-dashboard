'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageShell, { LoadError, Spinner, errorText } from '@/components/PageShell'
import OpeningForm from '@/components/OpeningForm'
import { deleteOpening, getOpenings, saveOpening, updateOpening } from '@/lib/firestore'
import { buildOpeningTree, flattenTree, formatMoves } from '@/lib/opening'
import type { NewOpeningLine, OpeningColor, OpeningLine } from '@/types/chess'

const COLOR_BADGE: Record<OpeningColor, string> = {
  any: 'Either colour',
  white: 'As White',
  black: 'As Black',
}

function OpeningsBody({ userId }: { userId: string }) {
  const [openings, setOpenings] = useState<OpeningLine[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      getOpenings(userId)
        .then(loaded => {
          setOpenings(loaded)
          setError(null)
        })
        .catch(caught => setError(errorText(caught, 'Could not load your saved openings.'))),
    [userId],
  )

  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => flattenTree(buildOpeningTree(openings ?? [])), [openings])
  const editing = openings?.find(opening => opening.id === editingId) ?? null

  async function handleSubmit(opening: NewOpeningLine) {
    setError(null)
    if (editingId) {
      await updateOpening(userId, editingId, opening)
      setOpenings(prev =>
        (prev ?? []).map(item => (item.id === editingId ? { ...opening, id: editingId } : item)),
      )
      setEditingId(null)
      return
    }

    const id = await saveOpening(userId, opening)
    setOpenings(prev => [...(prev ?? []), { ...opening, id }])
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
              <div className="flex-1 min-w-0" style={{ paddingLeft: depth * 20 }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  {depth > 0 && <span className="text-zinc-600 text-xs">↳</span>}
                  <span className="font-medium text-sm">{opening.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                    {COLOR_BADGE[opening.color]}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {opening.ply} half-moves
                    {children.length > 0 &&
                      ` · ${children.length} sub-variation${children.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 font-mono mt-1 break-words">
                  {formatMoves(opening.moves)}
                </div>
              </div>

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
