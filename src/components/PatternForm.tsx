'use client'

import { useMemo, useState } from 'react'
import {
  MAX_PATTERN_PLY,
  canNest,
  formatMoves,
  isParentLine,
  parsePattern,
  patternLabel,
} from '@/lib/pattern'
import type { NewPattern, PatternColor, PatternRecord } from '@/types/chess'

const COLORS: { value: PatternColor; label: string }[] = [
  { value: 'any', label: 'Either colour' },
  { value: 'white', label: 'As White' },
  { value: 'black', label: 'As Black' },
]

export default function PatternForm({
  initial,
  others,
  onSubmit,
  onCancel,
}: {
  /** The line being edited, or null when adding a new one. */
  initial: PatternRecord | null
  /** Every other saved line, used to show which variation this one sits under. */
  others: PatternRecord[]
  onSubmit: (pattern: NewPattern) => Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [pgn, setPgn] = useState(initial?.pgn ?? '')
  const [color, setColor] = useState<PatternColor>(initial?.color ?? 'any')
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

  /**
   * Where this line will be filed. `blocked` is a line it continues but cannot join
   * because that repertoire is saved for the other colour.
   */
  const nesting = useMemo(() => {
    if (!parsed?.ok) return null

    const continues = others
      .filter(other => isParentLine(other.moves, parsed.value.moves))
      .sort((a, b) => b.ply - a.ply)

    return {
      parent: continues.find(other => canNest(other, { color })) ?? null,
      blocked: continues.find(other => !canNest(other, { color })) ?? null,
    }
  }, [parsed, others, color])

  const canSave = Boolean(name.trim()) && parsed?.ok === true && !saving

  async function handleSubmit() {
    if (!parsed?.ok) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        pgn: pgn.trim(),
        moves: parsed.value.moves,
        positionKey: parsed.value.positionKey,
        ply: parsed.value.ply,
        color,
      })
      if (!initial) {
        setName('')
        setPgn('')
        setColor('any')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that opening.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">
          {initial ? `Editing “${initial.name}”` : 'Save an opening'}
        </h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Paste the line you want to track. A line that continues another saved line is filed under
          it as a sub-variation, so you can save 1.e4 c6 as Caro-Kann and 1.e4 c6 2.d4 d5 3.e5 as
          the Advance Variation inside it.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Name</span>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Advance Variation"
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Moves</span>
        <textarea
          value={pgn}
          onChange={event => setPgn(event.target.value)}
          rows={3}
          placeholder="1. e4 c6 2. d4 d5 3. e5"
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
          <span>
            {parsed.value.ply} half-moves ·{' '}
            {nesting?.parent ? (
              <>
                sub-variation of{' '}
                <span className="text-zinc-300">{patternLabel(nesting.parent)}</span>
              </>
            ) : (
              'a top-level opening'
            )}
          </span>
          {!nesting?.parent && nesting?.blocked && (
            <span className="text-amber-400">
              It continues {patternLabel(nesting.blocked)}, but that line is saved for the other
              colour — pick the matching colour above to file it there instead of starting a new
              top-level opening.
            </span>
          )}
          {parsed.value.ply > MAX_PATTERN_PLY && (
            <span className="text-amber-400">
              Longer than {MAX_PATTERN_PLY} half-moves — games are only searched that deep, so this
              line will never match.
            </span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={!canSave}
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Save opening'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  )
}
