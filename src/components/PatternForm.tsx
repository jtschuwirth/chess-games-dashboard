'use client'

import { useMemo, useState } from 'react'
import { MAX_PATTERN_PLY, formatMoves, parsePattern } from '@/lib/pattern'
import type { NewPattern, PatternColor } from '@/types/chess'

const COLORS: { value: PatternColor; label: string }[] = [
  { value: 'any', label: 'Either colour' },
  { value: 'white', label: 'As White' },
  { value: 'black', label: 'As Black' },
]

export default function PatternForm({ onSave }: { onSave: (pattern: NewPattern) => Promise<void> }) {
  const [name, setName] = useState('')
  const [pgn, setPgn] = useState('')
  const [color, setColor] = useState<PatternColor>('any')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => {
    if (!pgn.trim()) return null
    try {
      return { ok: true as const, value: parsePattern(pgn) }
    } catch (caught) {
      return { ok: false as const, message: (caught as Error).message }
    }
  }, [pgn])

  const canSave = Boolean(name.trim()) && parsed?.ok === true && !saving

  async function handleSave() {
    if (!parsed?.ok) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        pgn: pgn.trim(),
        moves: parsed.value.moves,
        positionKey: parsed.value.positionKey,
        ply: parsed.value.ply,
        color,
      })
      setName('')
      setPgn('')
      setColor('any')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that opening.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Save an opening</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Paste the line you want to track. A game counts as following it whenever the game reaches
          the position at the end of the line — move-order transpositions included.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Name</span>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Caro-Kann Tartakower, with Bd3"
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Moves</span>
        <textarea
          value={pgn}
          onChange={event => setPgn(event.target.value)}
          rows={3}
          placeholder="1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Nxf6+ exf6 6. Bd3"
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-zinc-600 resize-y"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Count games played</span>
        <select
          value={color}
          onChange={event => setColor(event.target.value as PatternColor)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
        >
          {COLORS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {parsed && !parsed.ok && <p className="text-sm text-red-400">{parsed.message}</p>}

      {parsed?.ok && (
        <div className="text-xs text-zinc-500 flex flex-col gap-1">
          <span className="font-mono text-zinc-400">{formatMoves(parsed.value.moves)}</span>
          <span>{parsed.value.ply} half-moves</span>
          {parsed.value.ply > MAX_PATTERN_PLY && (
            <span className="text-amber-400">
              Longer than {MAX_PATTERN_PLY} half-moves — games are only searched that deep, so this
              line will never match.
            </span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={handleSave}
        disabled={!canSave}
        className="self-start px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : 'Save opening'}
      </button>
    </section>
  )
}
