'use client'

import { useMemo, useState } from 'react'
import Chip from '@/components/Chip'
import LineBoard from '@/components/LineBoard'
import { buildOpeningTree, openingLabel, type OpeningNode } from '@/lib/opening'
import {
  KIND_LABEL,
  PATTERN_KINDS,
  clampStartPly,
  emptyLine,
  lineHasContent,
  parsePatternPgn,
} from '@/lib/pattern'
import type { NewPattern, OpeningLine, PatternKind, PatternLine } from '@/types/chess'

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="text-xs uppercase tracking-wide text-zinc-500">
      {children}
      {hint && <span className="normal-case tracking-normal text-zinc-700"> — {hint}</span>}
    </span>
  )
}

const INPUT =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/**
 * One line of a pattern: what it is called, the game, where the board opens, and what
 * to notice. The board sits beside the fields rather than under them, because pointing
 * the line at the right move is the one thing here you cannot do by typing.
 */
function LineFields({
  line,
  titlePlaceholder,
  onChange,
  onRemove,
}: {
  line: PatternLine
  titlePlaceholder: string
  onChange: (next: PatternLine) => void
  onRemove?: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  function setPgn(pgn: string) {
    // The PGN is kept whatever happens, so a typo does not throw away what you pasted.
    try {
      const moves = parsePatternPgn(pgn)
      setError(null)
      onChange({ ...line, pgn, moves, startPly: clampStartPly(line.startPly, moves) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that PGN.')
      onChange({ ...line, pgn })
    }
  }

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] gap-4 border border-zinc-800 rounded-xl p-3 bg-zinc-950/40">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <input
            value={line.title}
            onChange={event => onChange({ ...line, title: event.target.value })}
            placeholder={titlePlaceholder}
            className={`${INPUT} flex-1 min-w-0`}
          />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors shrink-0"
            >
              Remove
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label hint="paste the game, then point the board at the move">PGN</Label>
          <textarea
            value={line.pgn}
            onChange={event => setPgn(event.target.value)}
            rows={5}
            placeholder="1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4"
            className={`${INPUT} font-mono resize-y`}
          />
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : (
            line.moves.length > 0 && (
              <span className="text-xs text-zinc-600">{line.moves.length} half-moves read</span>
            )
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label hint="what to notice">Note</Label>
          <textarea
            value={line.note}
            onChange={event => onChange({ ...line, note: event.target.value })}
            rows={2}
            placeholder="Black gets ...c5 in before White can hold the centre"
            className={`${INPUT} resize-y`}
          />
        </div>
      </div>

      <div className="w-full max-w-[18rem] mx-auto md:mx-0">
        <LineBoard
          moves={line.moves}
          startPly={line.startPly}
          orientation={line.orientation ?? 'white'}
          onFlip={() =>
            onChange({
              ...line,
              orientation: (line.orientation ?? 'white') === 'white' ? 'black' : 'white',
            })
          }
          onSetStart={ply => onChange({ ...line, startPly: ply })}
        />
      </div>
    </div>
  )
}

/**
 * Every saved opening in tree order, each knowing what it hangs under.
 *
 * `flattenTree` gives the order and the depth but drops the trail, and the trail is the
 * part that matters here: filtering has to be able to keep a match's ancestors on screen,
 * or "Exchange variation" appears four times with nothing to tell them apart.
 */
function rowsWithTrail(
  nodes: OpeningNode[],
  trail: string[] = [],
): { node: OpeningNode; trail: string[] }[] {
  return nodes.flatMap(node => [
    { node, trail },
    ...rowsWithTrail(node.children, [...trail, node.opening.id]),
  ])
}

/** Past this many, scanning the list beats scrolling it. */
const FILTER_THRESHOLD = 8

/**
 * Picking the openings a pattern turns up in.
 *
 * A flat row of chips was wrong in a way that only shows with real data: half a
 * repertoire's lines are called "Exchange variation", and in a flat list they are four
 * identical chips. Nesting them under the line they branch from is the only thing that
 * tells them apart, so this keeps the same tree the dashboard and the openings page use —
 * one ordering of a repertoire, everywhere.
 */
function OpeningPicker({
  openings,
  selected,
  onToggle,
}: {
  openings: OpeningLine[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => rowsWithTrail(buildOpeningTree(openings)), [openings])

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (needle.length === 0) return rows

    // A match keeps its whole trail, so you can still see what it branches from.
    const keep = new Set<string>()
    for (const row of rows) {
      if (!openingLabel(row.node.opening).toLowerCase().includes(needle)) continue
      keep.add(row.node.opening.id)
      for (const id of row.trail) keep.add(id)
    }
    return rows.filter(row => keep.has(row.node.opening.id))
  }, [rows, filter])

  return (
    <div className="flex flex-col gap-1.5">
      {openings.length > FILTER_THRESHOLD && (
        <input
          value={filter}
          onChange={event => setFilter(event.target.value)}
          placeholder="filter openings"
          className={`${INPUT} py-1.5`}
        />
      )}

      <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800/60">
        {shown.length === 0 ? (
          <p className="px-3 py-2 text-xs text-zinc-600">Nothing matches that.</p>
        ) : (
          shown.map(({ node }) => {
            const active = selected.includes(node.opening.id)
            return (
              <button
                key={node.opening.id}
                type="button"
                onClick={() => onToggle(node.opening.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
                }`}
              >
                <span
                  className={`w-3 h-3 shrink-0 rounded-sm border flex items-center justify-center leading-none text-[9px] ${
                    active ? 'bg-zinc-200 border-zinc-200 text-zinc-900' : 'border-zinc-700'
                  }`}
                >
                  {active ? '✓' : ''}
                </span>
                <span className="min-w-0 truncate" style={{ paddingLeft: node.depth * 14 }}>
                  {node.depth > 0 && <span className="text-zinc-600">↳ </span>}
                  {openingLabel(node.opening)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * Writing up one pattern. The name is also the review tag, which is why it is asked for
 * first and why the form says so: it is the string you will be picking off a list months
 * from now with the game in front of you, not a title.
 */
export default function PatternForm({
  initial,
  openings,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: NewPattern
  openings: OpeningLine[]
  busy?: boolean
  onSubmit: (pattern: NewPattern) => Promise<void> | void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<PatternKind>(initial?.kind ?? 'tactics')
  const [conditions, setConditions] = useState((initial?.conditions ?? []).join('\n'))
  const [main, setMain] = useState<PatternLine>(initial?.main ?? emptyLine())
  const [examples, setExamples] = useState<PatternLine[]>(initial?.examples ?? [])
  const [openingIds, setOpeningIds] = useState<string[]>(initial?.openingIds ?? [])
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('A pattern needs a name — it is the tag you will reach for in a review.')
      return
    }

    setError(null)
    await onSubmit({
      name: trimmed,
      kind,
      conditions: conditions
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0),
      main,
      // an example you started and left blank is not worth storing
      examples: examples.filter(lineHasContent),
      openingIds,
      createdAt: initial?.createdAt ?? Date.now(),
    })
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <div className="flex flex-col gap-1.5 min-w-0">
          <Label hint="this is the tag you will pick when reviewing">Name</Label>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="accelerated fianchetto"
            className={INPUT}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Kind</Label>
          <div className="flex gap-1 flex-wrap">
            {PATTERN_KINDS.map(option => (
              <Chip key={option} active={kind === option} onClick={() => setKind(option)}>
                {KIND_LABEL[option]}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label hint="one per line">Conditions</Label>
        <textarea
          value={conditions}
          onChange={event => setConditions(event.target.value)}
          rows={3}
          placeholder={'A piece on c4/c5 to kick\nMy bishop still at home on f8'}
          className={`${INPUT} resize-y`}
        />
      </div>

      {openings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label hint="where this turns up">Openings</Label>
          <OpeningPicker
            openings={openings}
            selected={openingIds}
            onToggle={id =>
              setOpeningIds(prev =>
                prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id],
              )
            }
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label hint="the game that shows the idea">Main line</Label>
        <LineFields line={main} titlePlaceholder="what this line is called" onChange={setMain} />
      </div>

      <div className="flex flex-col gap-2">
        <Label hint="the same idea elsewhere">Examples</Label>
        {examples.map((example, index) => (
          <LineFields
            key={index}
            line={example}
            titlePlaceholder={`Example ${index + 1}`}
            onChange={next => setExamples(prev => prev.map((e, i) => (i === index ? next : e)))}
            onRemove={() => setExamples(prev => prev.filter((_, i) => i !== index))}
          />
        ))}
        <button
          type="button"
          onClick={() => setExamples(prev => [...prev, emptyLine()])}
          className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          + Add an example
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
        >
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Create pattern'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
