'use client'

import { useState } from 'react'
import {
  STANDINGS,
  STANDING_BADGE,
  STANDING_LABEL,
  TRANSITIONS,
  VERDICT_LABEL,
  type Standing,
} from '@/lib/verdict'
import { saveSettings } from '@/lib/firestore'
import { BREADTHS, BREADTH_LABEL, SEVERITY_LABEL, SEVERITY_MARK } from '@/lib/bands'
import {
  MAX_PHASES,
  SETTING_RANGE,
  SEVERITIES,
  normalizePhases,
  normalizeSettings,
  type AnalysisSettings,
  type NumberSetting,
  type PhaseSetting,
  type Severity,
} from '@/lib/settings'
import { gamePhases } from '@/lib/clocks'

/** In pawns on screen, in centipawns underneath. Nobody thinks in centipawns. */
function pawns(cp: number): string {
  return (cp / 100).toFixed(2).replace(/\.?0+$/, '')
}

function pawnText(cp: number): string {
  const value = pawns(cp)
  return `${value} pawn${value === '1' ? '' : 's'}`
}

function Field({
  label,
  hint,
  value,
  unit,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string
  hint: string
  value: number
  unit: string
  onChange: (next: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={event => onChange(Number(event.target.value))}
          className="w-24 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600 tabular-nums"
        />
        <span className="text-xs text-zinc-600">{unit}</span>
      </span>
      <span className="text-xs text-zinc-600">{hint}</span>
    </label>
  )
}



/** The same scale the marks use everywhere else. */
const MARK_TONE: Record<Severity, string> = {
  blunder: 'text-red-400',
  mistake: 'text-amber-400',
  inaccuracy: 'text-zinc-500',
}

/**
 * The landings worth showing for a row.
 *
 * A fault never leaves you winning — `classifyMove` will not mark one that does — and
 * never lands above where it started, so those cells exist only to keep the table total
 * and would read as nonsense here.
 */
function landings(fall: { from: Standing; to: Standing[] }): Standing[] {
  const ceiling = STANDINGS.indexOf(fall.from)
  const shown = fall.to.filter(
    to => to !== 'winning' && STANDINGS.indexOf(to) <= ceiling,
  )
  return shown.length > 0 ? shown : [fall.from]
}

/**
 * The bands a move can actually be played from.
 *
 * Only `mate` is left out: once the mate is on the board every move is the same move,
 * and a row saying so would be a row saying nothing.
 */
const REACHABLE: Standing[] = STANDINGS.filter(standing => standing !== 'mate')

/**
 * The numbers the analysis is a judgement about, and the table of what those judgements
 * come out as.
 *
 * Both halves belong together: every one of these started life as a constant that had to
 * be argued about and changed in code, and the argument was always "what should this
 * word mean". So the screen that sets them is the screen that says what they produce.
 *
 * Nothing is re-analysed when they change. Marks and verdicts are derived as the games
 * are read, so a new band re-reads the whole history on the next load.
 */
export default function AnalysisSettingsPanel({
  userId,
  settings,
  onSaved,
}: {
  userId: string
  settings: AnalysisSettings
  onSaved: (next: AnalysisSettings) => void
}) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: NumberSetting) => (value: number) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  /**
   * The phases exactly as typed, in the order the rows are in.
   *
   * Deliberately *not* normalised here. Sorting on every keystroke moves the row you
   * are typing in: setting a phase to start at move 4 re-sorted it to second place
   * halfway through typing "45", and the "5" went into whichever field had taken its
   * place. The same shape of bug as a tag picker that closes itself when you pick the
   * first tag — state derived on every change, reordering the thing under your hand.
   *
   * Tidying happens on blur instead, which is a moment you have finished.
   */
  function setPhases(next: PhaseSetting[]) {
    setDraft(prev => ({ ...prev, phases: next }))
    setSaved(false)
  }

  /** Sort, anchor and separate — once you have left the field. */
  function tidyPhases() {
    setDraft(prev => ({ ...prev, phases: normalizePhases(prev.phases) }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const next = await saveSettings(userId, draft)
      setDraft(next)
      onSaved(next)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save those settings.')
    } finally {
      setSaving(false)
    }
  }

  // what the numbers actually divide the board into, written out as you type
  const ready = normalizeSettings(draft)
  /**
   * The ranges the rows as typed would produce — in the order they are shown, not the
   * sorted order, so a range always belongs to the row beside it. A phase whose next
   * one starts earlier has no moves in it, and says so rather than printing a
   * backwards range.
   */
  const ranges = gamePhases({ ...ready, phases: draft.phases })

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-5">
      <h2 className="font-semibold">Analysis</h2>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field
          label="Level within"
          hint="Inside this, the position is even."
          value={draft.level}
          unit={`± ${pawnText(draft.level)}`}
          onChange={set('level')}
          min={SETTING_RANGE.level.min}
          max={SETTING_RANGE.level.max}
          step={10}
        />
        <Field
          label="Winning from"
          hint="Past this it is won — and past its negative, lost, where a move is no longer marked at all."
          value={draft.winning}
          unit={pawnText(draft.winning)}
          onChange={set('winning')}
          min={SETTING_RANGE.winning.min}
          max={SETTING_RANGE.winning.max}
          step={10}
        />
        <Field
          label="Concrete at most"
          hint="Up to this many moves holding means the position had a line in it."
          value={draft.narrow}
          unit="moves"
          onChange={set('narrow')}
          min={SETTING_RANGE.narrow.min}
          max={SETTING_RANGE.narrow.max}
        />
        <Field
          label="Mark from"
          hint="Below this a move is left alone. How bad a marked one is comes from the band it fell out of, not from this."
          value={draft.mistake}
          unit={pawnText(draft.mistake)}
          onChange={set('mistake')}
          min={SETTING_RANGE.mistake.min}
          max={SETTING_RANGE.mistake.max}
          step={10}
        />
        <Field
          label="Candidates"
          hint="How many moves the second pass asks the engine for. Each one costs search."
          value={draft.lines}
          unit="lines"
          onChange={set('lines')}
          min={SETTING_RANGE.lines.min}
          max={SETTING_RANGE.lines.max}
        />
      </div>

      {/* the bands as they will actually fall, so the numbers can be read as a board */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {STANDINGS.slice()
          .reverse()
          .map(standing => (
            <span
              key={standing}
              className={`px-2 py-1 rounded border ${STANDING_BADGE[standing]}`}
            >
              {STANDING_LABEL[standing]}{' '}
              <span className="opacity-60 font-mono">
                {standing === 'winning' && `≥ +${pawns(ready.winning)}`}
                {standing === 'better' && `+${pawns(ready.level)} … +${pawns(ready.winning)}`}
                {standing === 'level' && `± ${pawns(ready.level)}`}
                {standing === 'worse' && `−${pawns(ready.winning)} … −${pawns(ready.level)}`}
                {standing === 'losing' && `≤ −${pawns(ready.winning)}`}
              </span>
            </span>
          ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Show</span>
        <div className="flex gap-1.5 flex-wrap">
          {SEVERITIES.map(severity => {
            const on = draft.marks.includes(severity)
            return (
              <button
                key={severity}
                type="button"
                onClick={() => {
                  // never all off: a screen with nothing on it is not a setting anyone wants
                  const next = on
                    ? draft.marks.filter(mark => mark !== severity)
                    : SEVERITIES.filter(mark => mark === severity || draft.marks.includes(mark))
                  if (next.length === 0) return
                  setDraft(prev => ({ ...prev, marks: next }))
                  setSaved(false)
                }}
                className={`px-2 py-1 rounded-md border text-xs transition-colors ${
                  on
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                    : 'border-zinc-800 text-zinc-600 hover:border-zinc-700'
                }`}
              >
                <span className="font-mono">{SEVERITY_MARK[severity]}</span>{' '}
                {SEVERITY_LABEL[severity]}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-zinc-600">
          Everything is recorded either way; this is what reaches a screen, a count and a
          review.
        </span>
      </div>

      {/*
        The stretches a game is read in. Only where each one begins is set: a phase
        runs until the next starts, so there is no second number to disagree with the
        first, and no way to leave a gap or an overlap between them.

        The ranges shown beside the names are the ones the phase table and the eval
        graph will use, worked out the same way they work them out — the screen that
        sets the rule shows what the rule produces.
      */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Phases of a game</span>
        <span className="text-xs text-zinc-600">
          In your own moves, not plies. Each runs until the next begins; the last runs to
          the end.
        </span>

        <div className="flex flex-col gap-1.5 mt-1">
          {draft.phases.map((phase, index) => {
            const range = ranges[index]
            const first = index === 0

            return (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="number"
                  value={phase.from}
                  min={1}
                  disabled={first}
                  onChange={event => {
                    const typed = Math.round(Number(event.target.value))
                    setPhases(
                      draft.phases.map((entry, at) =>
                        at === index
                          ? { ...entry, from: Number.isFinite(typed) ? typed : entry.from }
                          : entry,
                      ),
                    )
                  }}
                  onBlur={tidyPhases}
                  title={first ? 'A game starts at move one' : 'The first of your moves in this phase'}
                  className="w-16 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-600 tabular-nums disabled:opacity-40"
                />
                <input
                  value={phase.name}
                  onChange={event =>
                    setPhases(
                      draft.phases.map((entry, at) =>
                        at === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                  aria-label="Phase name"
                  className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                />
                <span
                  className={`w-16 text-xs font-mono tabular-nums text-right ${
                    range && range.to < range.from ? 'text-amber-400' : 'text-zinc-500'
                  }`}
                  title={
                    range && range.to < range.from
                      ? 'Nothing falls in this phase — it is sorted when you leave the field'
                      : undefined
                  }
                >
                  {range && range.to < range.from ? 'empty' : range?.label}
                </span>
                <button
                  type="button"
                  onClick={() => setPhases(draft.phases.filter((entry, at) => at !== index))}
                  disabled={draft.phases.length < 2}
                  title={draft.phases.length < 2 ? 'A game needs at least one phase' : 'Remove this phase'}
                  aria-label="Remove this phase"
                  className="w-5 text-sm text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-30 disabled:hover:text-zinc-700"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>

        {draft.phases.length < MAX_PHASES && (
          <button
            type="button"
            onClick={() =>
              setPhases([
                ...draft.phases,
                {
                  name: `Phase ${draft.phases.length + 1}`,
                  from: (draft.phases[draft.phases.length - 1]?.from ?? 0) + 10,
                },
              ])
            }
            className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            + Add a phase
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
        <button
          onClick={() => {
            setDraft(normalizeSettings(undefined))
            setSaved(false)
          }}
          className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors ml-auto"
        >
          Back to the defaults
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">
          What each marked move is called
        </h3>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm min-w-[36rem]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-zinc-600">
                <th className="text-left font-normal px-5 py-2">The fall</th>
                <th className="text-left font-normal px-3 py-2">Counts as</th>
                {BREADTHS.map(breadth => (
                  <th key={breadth} className="text-left font-normal px-3 py-2">
                    {BREADTH_LABEL[breadth]}
                    <span className="normal-case tracking-normal text-zinc-700">
                      {breadth === 'sharp' && ` — ${draft.narrow} or fewer held`}
                      {breadth === 'tight' && ` — ${draft.narrow + 1} to ${draft.lines - 1}`}
                      {breadth === 'stable' && ' — all of them held'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {TRANSITIONS.filter(fall => REACHABLE.includes(fall.from)).map((fall, index) => (
                <tr key={index}>
                  <td className="px-5 py-2 whitespace-nowrap">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${STANDING_BADGE[fall.from]}`}
                    >
                      {STANDING_LABEL[fall.from]}
                    </span>
                    <span className="text-zinc-600"> → </span>
                    <span className="text-xs text-zinc-400">
                      {landings(fall).map(to => STANDING_LABEL[to]).join(' or ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`font-mono ${MARK_TONE[fall.severity]}`}
                      title={
                        draft.marks.includes(fall.severity)
                          ? 'shown'
                          : 'recorded, but left off the screen'
                      }
                    >
                      {SEVERITY_MARK[fall.severity]}
                    </span>{' '}
                    <span
                      className={
                        draft.marks.includes(fall.severity) ? 'text-zinc-300' : 'text-zinc-600'
                      }
                    >
                      {SEVERITY_LABEL[fall.severity]}
                    </span>
                  </td>
                  {BREADTHS.map(breadth => (
                    <td key={breadth} className="px-3 py-2 text-zinc-300">
                      {VERDICT_LABEL[fall[breadth] as keyof typeof VERDICT_LABEL]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-600">
          A move holds when it costs no more than an inaccuracy, which is the same rule
          that grades the move you played — so a move can no longer be flagged while the
          second pass counts it as having held.
        </p>
      </div>

    </section>
  )
}
