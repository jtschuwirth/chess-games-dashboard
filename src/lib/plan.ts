import { hasReview } from './review'
import type { GameRecord, NewStudyPlan, PlanDay, StudyPlan } from '@/types/chess'

export const DAY_MS = 24 * 60 * 60 * 1000

/** A week is the unit a plan is actually written in, so it is the default. */
export const DEFAULT_PLAN_DAYS = 7

/** More days than this and it stops being a plan and becomes a calendar. */
export const MAX_PLAN_DAYS = 60

/**
 * Local midnight for a moment. Plans are counted in days you lived through, not in
 * 24-hour blocks from whenever you pressed the button, so every date in a plan is
 * pinned to the start of its local day.
 */
export function startOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * The date day `index` falls on.
 *
 * Counted on the calendar rather than by adding `index * DAY_MS`, because a day is not
 * always 24 hours. Adding milliseconds across a clock change lands an hour short and
 * every later day reads as the one before it at 23:00 — a plan running through 5 April
 * 2026 in this timezone showed two day fours and no day five. `new Date(y, m, d + index)`
 * normalises over month ends, year ends and clock changes alike.
 */
export function dayDate(plan: Pick<StudyPlan, 'startDate'>, index: number): number {
  const start = new Date(startOfDay(plan.startDate))
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index).getTime()
}

/** `YYYY-MM-DD` in local time, which is what makes two moments the same day. */
export function dayKey(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Mon 29 Sep", written out rather than handed to `toLocaleDateString`.
 *
 * The locale version renders differently on the server and in the browser — 04/10/2026
 * against 10/4/2026 — which React reports as a hydration mismatch. Spelling the month
 * also removes the question of which number is the month, which is worth more here than
 * matching whatever the browser would have chosen.
 */
export function formatDay(ms: number): string {
  const date = new Date(ms)
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** The span a plan covers, for its title row. */
export function planRange(plan: Pick<StudyPlan, 'startDate' | 'days'>): string {
  if (plan.days.length === 0) return formatDay(plan.startDate)
  return `${formatDay(dayDate(plan, 0))} – ${formatDay(dayDate(plan, plan.days.length - 1))}`
}

/** The stored shape of a plan, without the document id Firestore keeps separately. */
export function planBody(plan: StudyPlan): NewStudyPlan {
  return {
    name: plan.name,
    startDate: plan.startDate,
    days: plan.days,
    createdAt: plan.createdAt,
  }
}

export interface Progress {
  done: number
  total: number
}

export function dayProgress(day: PlanDay): Progress {
  return { done: day.tasks.filter(task => task.done).length, total: day.tasks.length }
}

export function planProgress(plan: Pick<StudyPlan, 'days'>): Progress {
  return plan.days.reduce<Progress>(
    (total, day) => {
      const day_ = dayProgress(day)
      return { done: total.done + day_.done, total: total.total + day_.total }
    },
    { done: 0, total: 0 },
  )
}

/** A day with something to do and all of it done. An empty day is not finished. */
export function isDayComplete(day: PlanDay): boolean {
  const { done, total } = dayProgress(day)
  return total > 0 && done === total
}

/**
 * Which day of the plan today is, or null when today falls outside it. This is what
 * opens the right day when you arrive, rather than making you find it.
 */
export function todayIndex(
  plan: Pick<StudyPlan, 'startDate' | 'days'>,
  now = Date.now(),
): number | null {
  // compared on the calendar for the same reason `dayDate` is counted on it
  const key = dayKey(now)
  for (let index = 0; index < plan.days.length; index++) {
    if (dayKey(dayDate(plan, index)) === key) return index
  }
  return null
}

/**
 * The reviews you wrote on a given day.
 *
 * Nothing links a game to a plan: the day knows its date and a review knows when it was
 * written, so the two meet without either storing the other. That means a review written
 * on the right day turns up by itself, and nothing has to be kept in step when a plan is
 * edited or a game is re-reviewed.
 */
export function reviewsOn(games: GameRecord[], ms: number): GameRecord[] {
  const key = dayKey(ms)
  return games
    .filter(game => hasReview(game) && game.review && dayKey(game.review.reviewedAt) === key)
    .sort((a, b) => (a.review?.reviewedAt ?? 0) - (b.review?.reviewedAt ?? 0))
}

/**
 * A plan from a template: the same list of tasks on every day, to be edited from there.
 *
 * Typing four tasks across seven days by hand is twenty-eight fields for a week that is
 * nearly the same every day, which is the kind of friction that stops a plan being
 * written at all.
 */
export function buildPlan(input: {
  name: string
  startDate: number
  days: number
  tasks: string[]
}): NewStudyPlan {
  const tasks = input.tasks.map(text => text.trim()).filter(text => text.length > 0)
  const days = Math.max(1, Math.min(Math.round(input.days), MAX_PLAN_DAYS))

  return {
    name: input.name.trim(),
    startDate: startOfDay(input.startDate),
    days: Array.from({ length: days }, () => ({
      tasks: tasks.map(text => ({ text, done: false })),
      note: '',
    })),
    createdAt: Date.now(),
  }
}
