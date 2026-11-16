'use client'

import { useState } from 'react'
import TemplateEditor from '@/components/TemplateEditor'
import { DAYS_PER_WEEK, dayDate, templateFor } from '@/lib/plan'
import { formatDay } from '@/lib/days'
import type { StudyPlan } from '@/types/chess'

/**
 * The week every other week is shown through.
 *
 * A plan is the same handful of tasks on most days, and typing them into eighty-four
 * days is why a plan does not get written down. So one week says what each weekday asks
 * for; every day of every week draws its tasks from the entry at its own position, and
 * none of it reaches a day's document until that day is touched.
 *
 * It is **above** the weeks because it is what they are made of: the thing you set up
 * once, before there is anything to tick. Folded by default for the same reason — it is
 * read when a plan is being written and almost never afterwards.
 *
 * The rows are deliberately thinner than a day's. A template says what to do, so it has
 * a text box, how many there are and a way to remove one; it has no tick, no stepper, no
 * note and no grip, because none of those are things a template can answer. Drawing a
 * day's row here would offer four controls that do nothing.
 */
export default function PlanTemplateCard({
  plan,
  unsaved,
  saving,
  justSaved,
  onSave,
  onChange,
}: {
  plan: StudyPlan
  /** Whether the template differs from the copy Firestore has. */
  unsaved: boolean
  saving: boolean
  justSaved: boolean
  /** Writing the template by itself, the way a day of the plan is written by itself. */
  onSave: () => void
  /** An updater, like every edit on this page, for the reason the day card states. */
  onChange: (update: (current: StudyPlan) => StudyPlan) => void
}) {
  const [open, setOpen] = useState(false)

  /** The template as seven lists, whatever the stored one holds. */
  const days = Array.from({ length: DAYS_PER_WEEK }, (unused, index) => templateFor(plan, index))
  const total = days.reduce((count, day) => count + day.length, 0)



  return (
    <section
      className={`bg-zinc-900 border rounded-xl transition-colors ${
        unsaved ? 'border-amber-500/40' : 'border-zinc-800'
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-baseline gap-3 flex-1 min-w-0 text-left"
        >
          <h2 className="text-sm font-semibold text-zinc-100 shrink-0">Template week</h2>
          <span className="text-xs text-zinc-500 truncate">
            {total === 0
              ? 'what every week asks for, before you tick anything'
              : `${total} task${total === 1 ? '' : 's'} across the week`}
          </span>
        </button>

        {/*
          A dot rather than a word, the sheet's rule — and it shows while the card is
          folded, because that is when you need telling there is something here to save.
        */}
        {unsaved && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
            title="Only on this device"
          />
        )}

        {/*
          Saves the template and nothing else, the way a day of the plan does. Setting
          one up is what you do before there is anything to tick, so being made to commit
          a half-written week of days to keep it is the wrong unit.
        */}
        {(unsaved || saving) && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-2 py-1 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors disabled:opacity-40 shrink-0"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {justSaved && !unsaved && <span className="text-xs text-emerald-400 shrink-0">Saved</span>}

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Fold the template' : 'Open the template'}
          className="w-6 h-6 shrink-0 rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-colors text-sm leading-none"
        >
          {open ? '−' : '+'}
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {/*
            The one thing the rows cannot say: where these tasks turn up, and what makes
            one stop being a template task and start being a day's own.
          */}
          <p className="text-xs text-zinc-600">
            Every day of every week shows the row at its own position. Tick, change or
            mark one on a day and that day is written with these tasks as they stand.
          </p>

          {/* the same editor the form that creates a plan uses — one of it, so the `×5`
              rule and the JSON shape cannot drift between the two moments it is used */}
          <TemplateEditor
            template={plan.template}
            labelFor={index => formatDay(dayDate(plan, 0, index)).split(' ')[0]}
            onChange={next =>
              onChange(current => {
                const plan = { ...current }
                if (next) plan.template = next
                else delete plan.template
                return plan
              })
            }
          />
        </div>
      )}
    </section>
  )
}
