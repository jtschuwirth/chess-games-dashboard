'use client'

import { useState } from 'react'
import {
  STANDINGS,
  STANDING_BADGE,
  STANDING_LABEL,
  VERDICT_LABEL,
  type Standing,
} from '@/lib/verdict'
import { saveSettings } from '@/lib/firestore'
import {
  BREADTHS,
  BREADTH_LABEL,
  SEVERITY_LABEL,
  SEVERITY_MARK,
  TRANSITIONS,
  breadthSpan,
  fallKey,
  transitions,
  withGrade,
  type Fall,
} from '@/lib/bands'
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

/**
 * One setting: its name, its box, and what the number in the box means.
 *
 * Three cells of the group's own grid rather than a self-contained field, so the three
 * line up down the panel — the same reason `FilterRow` is a row of the filter's grid and
 * not a stack of its own. They were five boxes in a two-column grid, each with a
 * paragraph under it, and the reading you actually wanted — `± 0.8 pawns` against a
 * stored `80` — was the smallest grey thing on the row.
 *
 * The range comes off `SETTING_RANGE` rather than being passed in. There is one table of
 * what each of these may be and five call sites repeating two numbers out of it is five
 * chances to disagree with it.
 *
 * The sentence that used to sit underneath is the label's `title`, which is the rule the
 * rest of the app follows: text earns its place only if it says something the control
 * cannot — and for the two pairs below, the control now says it, in a strip.
 */
function Field({
  name,
  label,
  title,
  reading,
  value,
  step = 1,
  onChange,
}: {
  name: NumberSetting
  label: string
  /** What it does, for the one thing the number and its strip cannot say. */
  title: string
  /** What the number means, in the unit the rest of the app reads it in. */
  reading: string
  value: number
  step?: number
  onChange: (next: number) => void
}) {
  const { min, max } = SETTING_RANGE[name]

  return (
    <>
      <label htmlFor={`setting-${name}`} title={title} className="text-sm text-zinc-300 cursor-help">
        {label}
      </label>
      <input
        id={`setting-${name}`}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(Number(event.target.value))}
        className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600 tabular-nums"
      />
      <span className="text-sm text-zinc-400 tabular-nums">{reading}</span>
    </>
  )
}

/**
 * A few settings and the picture of what they come out as.
 *
 * `below` is the point of the thing: every group here sets numbers whose meaning is a
 * shape — the bands a move can fall between, the buckets a candidate count is cut into,
 * the marks that reach a screen — and that shape, drawn directly under the boxes, says
 * what five paragraphs were trying to.
 */
function SettingGroup({
  title,
  below,
  children,
}: {
  title: string
  below?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{title}</span>
      <div className="grid grid-cols-[auto_5rem_1fr] items-center gap-x-3 gap-y-2">
        {children}
      </div>
      {below}
    </div>
  )
}



/**
 * A mark as a chip, in the one style the panel gives them.
 *
 * Two rows press these now — which marks reach a screen, and what one disputed fall
 * counts as — and a chip that looked different in the second would read as a different
 * kind of control rather than the same word being chosen.
 */
function MarkChip({
  severity,
  on,
  title,
  onClick,
}: {
  severity: Severity
  on: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded-md border text-xs transition-colors ${
        on
          ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
          : 'border-zinc-800 text-zinc-600 hover:border-zinc-700'
      }`}
    >
      <span className="font-mono">{SEVERITY_MARK[severity]}</span> {SEVERITY_LABEL[severity]}
    </button>
  )
}

/** The same scale the marks use everywhere else. */
const MARK_TONE: Record<Severity, string> = {
  blunder: 'text-red-400',
  mistake: 'text-amber-400',
  inaccuracy: 'text-zinc-500',
}

/**
 * What a fall costs, as the control that sets it.
 *
 * The table was already the one place every fall is written down with what it counts as,
 * so when every cell became the account's to decide there was nowhere better to put the
 * choice — and nowhere else that could show it in the company of the fifteen others it
 * is being weighed against. Fifteen rows of three chips would be forty-five buttons in a
 * table you are meant to read, so it is one control per row, showing what it is set to.
 *
 * `appearance-none` and no border until you are on it: at rest this has to read as the
 * badge it replaced, because the table is read far more often than it is changed.
 */
function SeverityPicker({
  fall,
  value,
  shown,
  onPick,
}: {
  fall: Fall
  value: Severity
  /** Whether this mark reaches a screen, which is the other half of what the cell says. */
  shown: boolean
  onPick: (severity: Severity) => void
}) {
  const table = TRANSITIONS.find(entry => fallKey(entry) === fallKey(fall))?.severity
  const changed = table !== undefined && table !== value

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={value}
        onChange={event => onPick(event.target.value as Severity)}
        title={
          changed
            ? `You grade this one differently — the table's own answer is ${SEVERITY_LABEL[table]}`
            : shown
              ? 'shown'
              : 'recorded, but left off the screen'
        }
        className={`appearance-none bg-transparent border border-transparent rounded-md -ml-1.5 px-1.5 py-0.5 cursor-pointer outline-none transition-colors hover:border-zinc-700 hover:bg-zinc-950 focus:border-zinc-600 focus:bg-zinc-950 ${
          shown ? MARK_TONE[value] : 'text-zinc-600'
        }`}
      >
        {SEVERITIES.map(severity => (
          <option key={severity} value={severity} className="bg-zinc-900 text-zinc-200">
            {SEVERITY_MARK[severity]} {SEVERITY_LABEL[severity]}
          </option>
        ))}
      </select>
      {/* a dot rather than a word: on a column of fifteen, "changed" fifteen times is noise */}
      {changed && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0"
          title={`Yours. The table says ${SEVERITY_LABEL[table]}.`}
        />
      )}
    </span>
  )
}

/**
 * The landings worth showing for a row.
 *
 * One rule: a marked move never leaves you better off than you were, so a landing above
 * where it started exists only to keep the table total and would read as nonsense here.
 *
 * It also said `to !== 'winning'`, which was a second rule doing the first one's job
 * badly — it dropped the only landing that is *not* above where it started when the
 * fall begins in `winning`. Every other band had its own row for staying put and that
 * one did not, which is exactly how it looked: a table where `better → better` and
 * `level → level` were listed and `winning → winning` was not.
 */
function landings(fall: { from: Standing; to: Standing[] }): Standing[] {
  const ceiling = STANDINGS.indexOf(fall.from)
  const shown = fall.to.filter(to => STANDINGS.indexOf(to) <= ceiling)
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

      {/*
        Three groups, each one a couple of numbers and the shape they come out as.

        It was five boxes in one grid with a paragraph under each, and the paragraphs
        were doing a job the screen could do itself: `level` and `winning` *are* the
        band strip, `narrow` and `lines` *are* the three buckets, and both were already
        drawn elsewhere on this page — the strip below all five boxes, the buckets in a
        column heading at the very bottom. Reading either meant holding a number in your
        head while you looked somewhere else for what it did.
      */}
      <SettingGroup
        title="The bands"
        below={
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
        }
      >
        <Field
          name="level"
          label="Level within"
          title="Inside this the position is even — and it is the band a move has to fall out of before it is marked at all."
          value={draft.level}
          reading={`± ${pawnText(draft.level)}`}
          onChange={set('level')}
          step={10}
        />
        <Field
          name="winning"
          label="Winning from"
          title="Past this it is won, and past its negative it is lost — where a move is no longer marked, because a position already gone has no better move to point at."
          value={draft.winning}
          reading={`± ${pawnText(draft.winning)}`}
          onChange={set('winning')}
          step={10}
        />
      </SettingGroup>

      <SettingGroup
        title="What gets marked"
        below={
          /* the one thing the chips cannot say: the ones you turn off are still counted */
          <span className="text-xs text-zinc-600">
            Everything is recorded either way; this is what reaches a screen, a count and
            a review.
          </span>
        }
      >
        <Field
          name="mistake"
          label="Mark from"
          title="Below this a move is left alone. How bad a marked one is comes from the band it fell out of, not from this."
          value={draft.mistake}
          reading={pawnText(draft.mistake)}
          onChange={set('mistake')}
          step={10}
        />

        {/*
          `Winning → better` was a row here while it was the only disputed cell, and it
          stopped being one the moment the whole column became a control: a setting for
          one row of a table you can edit is a second way to say the same thing, and the
          one further from the thing it sets.
        */}
        <label
          className="text-sm text-zinc-300 cursor-help"
          title="Which of the three reach a screen, a count and a review. The rest are still recorded."
        >
          Show
        </label>
        <div className="col-span-2 flex gap-1.5 flex-wrap">
          {SEVERITIES.map(severity => {
            const on = draft.marks.includes(severity)
            return (
              <MarkChip
                key={severity}
                severity={severity}
                on={on}
                onClick={() => {
                  // never all off: a screen with nothing on it is not a setting anyone wants
                  const next = on
                    ? draft.marks.filter(mark => mark !== severity)
                    : SEVERITIES.filter(mark => mark === severity || draft.marks.includes(mark))
                  if (next.length === 0) return
                  setDraft(prev => ({ ...prev, marks: next }))
                  setSaved(false)
                }}
              />
            )
          })}
        </div>
      </SettingGroup>

      <SettingGroup
        title="The second pass"
        below={
          <div className="flex flex-wrap gap-1.5 text-xs">
            {BREADTHS.map(breadth => (
              <span
                key={breadth}
                className="px-2 py-1 rounded border border-zinc-800 text-zinc-400"
              >
                {BREADTH_LABEL[breadth]}{' '}
                <span className="text-zinc-600 font-mono">{breadthSpan(breadth, ready)}</span>
              </span>
            ))}
          </div>
        }
      >
        <Field
          name="lines"
          label="Candidates"
          title="How many moves the second pass asks the engine for. Each one costs search: a five-line search is five times a plain one."
          value={draft.lines}
          reading="lines"
          onChange={set('lines')}
        />
        <Field
          name="narrow"
          label="Concrete at most"
          title="Holding on this many or fewer means the position had a line in it — the same idea often has two move orders, so one answer written twice is still one answer."
          value={draft.narrow}
          reading="moves"
          onChange={set('narrow')}
        />
      </SettingGroup>

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

      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">
            What each fall costs, and what it is called
          </h3>
          {/*
            Only once something is yours, the rule every Reset here follows — and it says
            how many rather than just offering, since an override is a thing you made and
            not a filter you can see the effect of at a glance.
          */}
          {draft.grades.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraft(prev => ({ ...prev, grades: [] }))
                setSaved(false)
              }}
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Back to the table on {draft.grades.length === 1 ? 'one row' : `${draft.grades.length} rows`}
            </button>
          )}
        </div>

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
                      {' — '}
                      {breadthSpan(breadth, ready)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {/* graded as this account grades it, so the switch above moves a row here */}
              {transitions(ready)
                .filter(fall => REACHABLE.includes(fall.from))
                .map((fall, index) => (
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
                    <SeverityPicker
                      fall={fall}
                      value={fall.severity}
                      shown={draft.marks.includes(fall.severity)}
                      onPick={severity => {
                        setDraft(prev => ({
                          ...prev,
                          grades: withGrade(prev.grades, fall, severity),
                        }))
                        setSaved(false)
                      }}
                    />
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
          that grades the move you played — so raising a row above that takes its landing
          out of what the second pass counts as having held.
        </p>
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

    </section>
  )
}
