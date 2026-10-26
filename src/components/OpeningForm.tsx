'use client'

import { useMemo, useState } from 'react'
import {
  MAX_OPENING_PLY,
  canNest,
  formatMoves,
  isParentLine,
  parseOpening,
  openingLabel,
} from '@/lib/opening'
import type { NewOpeningLine, OpeningColor, OpeningLine } from '@/types/chess'

const COLORS: { value: OpeningColor; label: string }[] = [
  { value: 'any', label: 'Either colour' },
  { value: 'white', label: 'As White' },
  { value: 'black', label: 'As Black' },
]

export default function OpeningForm({
  initial,
  others,
  onSubmit,
  onCancel,
}: {
  /** The line being edited, or null when adding a new one. */
  initial: OpeningLine | null
  /** Every other saved line, used to show which variation this one sits under. */
  others: OpeningLine[]
  onSubmit: (opening: NewOpeningLine) => Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [pgn, setPgn] = useState(initial?.pgn ?? '')
  const [color, setColor] = useState<OpeningColor>(initial?.color ?? 'any')
  /** The other ways in, as the text of each — parsed the same way the main line is. */
  const [altPgns, setAltPgns] = useState<string[]>(
    () => initial?.alts?.map(alt => alt.pgn || formatMoves(alt.moves)) ?? [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const read = (text: string) => {
    if (!text.trim()) return null
    try {
      return { ok: true as const, value: parseOpening(text) }
    } catch (caught) {
      return { ok: false as const, message: (caught as Error).message }
    }
  }

  const parsed = useMemo(() => read(pgn), [pgn])

  /**
   * Each other way in, with what is wrong with it.
   *
   * Two complaints rather than one, the exercise card's rule: a line that will not parse
   * is a different problem from one that parses and says nothing new, and rolling them
   * into a single message sends you to the box you did not touch.
   */
  const alts = useMemo(() => {
    const seen = new Set(parsed?.ok ? [parsed.value.positionKey] : [])

    return altPgns.map(text => {
      const entry = read(text)
      if (!entry?.ok) return { text, parsed: entry, duplicate: false, claimedBy: null }

      const key = entry.value.positionKey
      const duplicate = seen.has(key)
      seen.add(key)

      // a position another line already claims will put the same game in two rows of the
      // dashboard's breakdown, so it is said here rather than discovered in the totals
      const claimedBy = others.find(other => other.keys.includes(key)) ?? null

      return { text, parsed: entry, duplicate, claimedBy }
    })
  }, [altPgns, parsed, others])

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
        // a way in that will not parse, or that reaches the main line's own position, is
        // dropped rather than stored — the same bargain an empty exercise makes
        alts: alts.flatMap(alt =>
          alt.parsed?.ok && !alt.duplicate ? [{ pgn: alt.text.trim(), ...alt.parsed.value }] : [],
        ),
      })
      if (!initial) {
        setName('')
        setPgn('')
        setAltPgns([])
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

      {/*
        Other move orders reaching the same idea. They widen what counts as having
        reached this opening and change nothing else: the main line above is still what
        the tree files it under, so the Panov sits once under the Caro-Kann however many
        ways into it you write down, rather than nesting inside itself five times.
      */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Other ways in</span>
          <button
            type="button"
            onClick={() => setAltPgns(current => [...current, ''])}
            className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            + Another way in
          </button>
        </div>

        {alts.length === 0 ? (
          <p className="text-xs text-zinc-600">
            A line that arrives from a different opening — the Panov from a Queen&rsquo;s Gambit
            move order. Games reaching any of them count as this opening, and say which one
            they took.
          </p>
        ) : (
          alts.map((alt, index) => (
            <div key={index} className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <textarea
                  value={alt.text}
                  onChange={event =>
                    setAltPgns(current =>
                      current.map((entry, at) => (at === index ? event.target.value : entry)),
                    )
                  }
                  rows={2}
                  placeholder="1. d4 d5 2. c4 c6 3. e4 dxe4 4. Nc3"
                  className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-zinc-600 resize-y"
                />
                <button
                  type="button"
                  onClick={() => setAltPgns(current => current.filter((_, at) => at !== index))}
                  title="Remove this way in"
                  className="shrink-0 mt-1.5 w-6 h-6 flex items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
                >
                  ✕
                </button>
              </div>

              {alt.parsed && !alt.parsed.ok && (
                <p className="text-xs text-red-400">{alt.parsed.message}</p>
              )}
              {alt.parsed?.ok && (
                <p className="text-xs text-zinc-600">
                  {alt.parsed.value.ply} half-moves
                  {alt.duplicate && (
                    <span className="text-amber-400">
                      {' '}
                      · reaches the same position as a line above, so it adds nothing
                    </span>
                  )}
                  {!alt.duplicate && alt.claimedBy && (
                    <span className="text-amber-400">
                      {' '}
                      · {openingLabel(alt.claimedBy)} already claims that position, so a game
                      reaching it will count under both
                    </span>
                  )}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Count games played</span>
        <select
          value={color}
          onChange={event => setColor(event.target.value as OpeningColor)}
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
                <span className="text-zinc-300">{openingLabel(nesting.parent)}</span>
              </>
            ) : (
              'a top-level opening'
            )}
          </span>
          {!nesting?.parent && nesting?.blocked && (
            <span className="text-amber-400">
              It continues {openingLabel(nesting.blocked)}, but that line is saved for the other
              colour — pick the matching colour above to file it there instead of starting a new
              top-level opening.
            </span>
          )}
          {parsed.value.ply > MAX_OPENING_PLY && (
            <span className="text-amber-400">
              Longer than {MAX_OPENING_PLY} half-moves — games are only searched that deep, so this
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
