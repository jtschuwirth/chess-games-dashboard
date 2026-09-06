'use client'

import { useEffect, useState } from 'react'
import PageShell, { Spinner } from '@/components/PageShell'
import PatternForm from '@/components/PatternForm'
import { deletePattern, getPatterns, savePattern } from '@/lib/firestore'
import { formatMoves } from '@/lib/pattern'
import type { NewPattern, PatternColor, PatternRecord } from '@/types/chess'

const COLOR_BADGE: Record<PatternColor, string> = {
  any: 'Either colour',
  white: 'As White',
  black: 'As Black',
}

function PatternsBody({ userId }: { userId: string }) {
  const [patterns, setPatterns] = useState<PatternRecord[] | null>(null)

  useEffect(() => {
    getPatterns(userId).then(setPatterns)
  }, [userId])

  async function handleSave(pattern: NewPattern) {
    const id = await savePattern(userId, pattern)
    setPatterns(prev =>
      [...(prev ?? []), { ...pattern, id }].sort((a, b) => a.name.localeCompare(b.name)),
    )
  }

  async function handleDelete(patternId: string) {
    await deletePattern(userId, patternId)
    setPatterns(prev => (prev ?? []).filter(pattern => pattern.id !== patternId))
  }

  return (
    <>
      <PatternForm onSave={handleSave} />

      {patterns === null ? (
        <div className="py-16 flex justify-center">
          <Spinner size="w-6 h-6" />
        </div>
      ) : patterns.length === 0 ? (
        <div className="py-16 text-center text-zinc-500">
          No openings saved yet — add your first line above.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
          {patterns.map(pattern => (
            <div
              key={pattern.id}
              className="flex items-start gap-4 px-5 py-4 bg-zinc-900 hover:bg-zinc-800 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium text-sm">{pattern.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                    {COLOR_BADGE[pattern.color]}
                  </span>
                  <span className="text-xs text-zinc-600">{pattern.ply} half-moves</span>
                </div>
                <div className="text-xs text-zinc-500 font-mono mt-1 break-words">
                  {formatMoves(pattern.moves)}
                </div>
              </div>
              <button
                onClick={() => handleDelete(pattern.id)}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-lg leading-none shrink-0"
                title="Delete opening"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default function PatternsPage() {
  return <PageShell title="Openings">{user => <PatternsBody userId={user.uid} />}</PageShell>
}
