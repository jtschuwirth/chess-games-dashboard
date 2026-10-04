import { hasReview } from './review'
import type {
  GameRecord,
  NewStudyPlan,
  PlanDay,
  PlanTask,
  PlanWeek,
  StudyPlan,
} from '@/types/chess'

export const DAY_MS = 24 * 60 * 60 * 1000

/** A week is the unit a plan is written in, so it is the unit a plan is made of. */
export const DAYS_PER_WEEK = 7

/** Longer than this and it stops being a plan and becomes a calendar. */
export const MAX_PLAN_WEEKS = 26

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

/* ------------------------------------------------------------------- reading */

/** A task from either shape: `done: true` was one of one, `done: false` none of one. */
function normalizeTask(raw: PlanTask): PlanTask {
  const legacy = raw as PlanTask & { done: number | boolean }

  if (typeof legacy.done === 'boolean') {
    return { text: raw.text ?? '', target: 1, done: legacy.done ? 1 : 0 }
  }

  const target = Math.max(1, Math.round(raw.target ?? 1))
  return {
    text: raw.text ?? '',
    target,
    done: Math.max(0, Math.min(Math.round(legacy.done ?? 0), target)),
  }
}

/**
 * A stored plan in the shape the code expects, whatever shape it was written in.
 *
 * Two have existed. The first was a flat `days` array whose tasks were ticked or not;
 * this one is weeks of days whose tasks are counted. Both are converted on read rather
 * than migrated, the same habit as `betterMovesOf` and the pre-game ratings — and since
 * `updatePlan` replaces the document, a plan rewrites itself into the new shape the
 * first time you touch it.
 */
export function normalizePlan(raw: StudyPlan): StudyPlan {
  const legacy = raw as StudyPlan & { days?: PlanDay[] }
  const weeks = Array.isArray(raw.weeks)
    ? raw.weeks
    : [{ name: '', days: Array.isArray(legacy.days) ? legacy.days : [] }]

  return {
    ...raw,
    weeks: weeks.map(week => ({
      name: week.name ?? '',
      days: (week.days ?? []).map(day => ({
        note: day.note ?? '',
        tasks: (day.tasks ?? []).map(normalizeTask),
      })),
    })),
  }
}

/** The stored shape of a plan, without the document id Firestore keeps separately. */
export function planBody(plan: StudyPlan): NewStudyPlan {
  return {
    name: plan.name,
    startDate: plan.startDate,
    weeks: plan.weeks,
    createdAt: plan.createdAt,
  }
}

/* --------------------------------------------------------------------- dates */

/** Which day of the plan this is, counting from zero across every week before it. */
export function dayOffset(
  plan: Pick<StudyPlan, 'weeks'>,
  weekIndex: number,
  dayIndex: number,
): number {
  let offset = dayIndex
  for (let i = 0; i < weekIndex; i++) offset += plan.weeks[i]?.days.length ?? 0
  return offset
}

/**
 * The date an offset falls on.
 *
 * Counted on the calendar rather than by adding `offset * DAY_MS`, because a day is not
 * always 24 hours. Adding milliseconds across a clock change lands an hour short and
 * every later day reads as the one before it at 23:00 — a plan running through 5 April
 * 2026 in this timezone showed two day fours and no day five. `new Date(y, m, d + n)`
 * normalises over month ends, year ends and clock changes alike.
 */
export function dateAt(plan: Pick<StudyPlan, 'startDate'>, offset: number): number {
  const start = new Date(startOfDay(plan.startDate))
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset).getTime()
}

/** The date of one day of one week. */
export function dayDate(
  plan: Pick<StudyPlan, 'startDate' | 'weeks'>,
  weekIndex: number,
  dayIndex: number,
): number {
  return dateAt(plan, dayOffset(plan, weekIndex, dayIndex))
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
 * also removes the question of which number is the month.
 */
export function formatDay(ms: number): string {
  const date = new Date(ms)
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** "28 Sep – 4 Oct", the span a week or a plan covers. */
function rangeLabel(from: number, to: number): string {
  const a = new Date(from)
  const b = new Date(to)
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
}

export function weekRange(plan: Pick<StudyPlan, 'startDate' | 'weeks'>, weekIndex: number): string {
  const days = plan.weeks[weekIndex]?.days.length ?? 0
  if (days === 0) return ''
  return rangeLabel(dayDate(plan, weekIndex, 0), dayDate(plan, weekIndex, days - 1))
}

export function planRange(plan: Pick<StudyPlan, 'startDate' | 'weeks'>): string {
  const total = plan.weeks.reduce((count, week) => count + week.days.length, 0)
  if (total === 0) return formatDay(plan.startDate)
  return rangeLabel(dateAt(plan, 0), dateAt(plan, total - 1))
}

/** What a week is called: its own name, or where it sits. */
export function weekLabel(week: PlanWeek, index: number): string {
  return week.name.trim() || `week ${index + 1}`
}

/* ------------------------------------------------------------------ progress */

export interface Progress {
  done: number
  total: number
}

/** A task is finished when every one of it is. */
export function taskComplete(task: PlanTask): boolean {
  return task.target > 0 && task.done >= task.target
}

/**
 * Progress counts the things, not the lines: five puzzles out of five is five done, so
 * a day of "5 puzzles" and "1 game" reads 3/6 when you have solved three. Counting lines
 * instead would leave a day looking untouched until a whole task was finished.
 */
export function dayProgress(day: PlanDay): Progress {
  return day.tasks.reduce<Progress>(
    (total, task) => ({
      done: total.done + Math.min(task.done, task.target),
      total: total.total + task.target,
    }),
    { done: 0, total: 0 },
  )
}

function sum(parts: Progress[]): Progress {
  return parts.reduce(
    (total, part) => ({ done: total.done + part.done, total: total.total + part.total }),
    { done: 0, total: 0 },
  )
}

export function weekProgress(week: PlanWeek): Progress {
  return sum(week.days.map(dayProgress))
}

export function planProgress(plan: Pick<StudyPlan, 'weeks'>): Progress {
  return sum(plan.weeks.map(weekProgress))
}

/** A day with something to do and all of it done. An empty day is not finished. */
export function isDayComplete(day: PlanDay): boolean {
  const { done, total } = dayProgress(day)
  return total > 0 && done === total
}

/* --------------------------------------------------------------------- today */

export interface PlanPosition {
  week: number
  day: number
}

/**
 * Where today sits in the plan, or null when today falls outside it. This is what opens
 * the right week and the right day on arrival, rather than making you find them.
 */
export function todayPosition(
  plan: Pick<StudyPlan, 'startDate' | 'weeks'>,
  now = Date.now(),
): PlanPosition | null {
  // compared on the calendar for the same reason `dateAt` is counted on it
  const key = dayKey(now)

  for (let week = 0; week < plan.weeks.length; week++) {
    for (let day = 0; day < plan.weeks[week].days.length; day++) {
      if (dayKey(dayDate(plan, week, day)) === key) return { week, day }
    }
  }
  return null
}

/* ------------------------------------------------------------------- reviews */

/**
 * The reviews you wrote on a given day.
 *
 * Nothing links a game to a plan: the day knows its date and a review knows when it was
 * written, so the two meet without either storing the other. A review written on the
 * right day turns up by itself, and nothing has to be kept in step when a plan is edited
 * or a game is reviewed again.
 */
export function reviewsOn(games: GameRecord[], ms: number): GameRecord[] {
  const key = dayKey(ms)
  return games
    .filter(game => hasReview(game) && game.review && dayKey(game.review.reviewedAt) === key)
    .sort((a, b) => (a.review?.reviewedAt ?? 0) - (b.review?.reviewedAt ?? 0))
}

/* ------------------------------------------------------------------ building */

/**
 * A task from a template line. A trailing `×5` or `x5` is how many of the thing there
 * are, so "solve puzzles ×5" is one task you tick five times rather than five tasks.
 */
export function parseTaskLine(line: string): PlanTask | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null

  const match = trimmed.match(/^(.*?)\s*[x×]\s*(\d{1,3})$/i)
  if (match && match[1].trim().length > 0) {
    return { text: match[1].trim(), target: Math.max(1, Number(match[2])), done: 0 }
  }

  return { text: trimmed, target: 1, done: 0 }
}

/** A week of empty days carrying the template. */
export function buildWeek(tasks: PlanTask[], days = DAYS_PER_WEEK): PlanWeek {
  return {
    name: '',
    days: Array.from({ length: Math.max(1, days) }, () => ({
      tasks: tasks.map(task => ({ ...task, done: 0 })),
      note: '',
    })),
  }
}

/**
 * A plan from a template: the same tasks on every day of every week, to be edited from
 * there. Typing four tasks across twenty-one days by hand is the kind of friction that
 * stops a plan being written at all.
 */
export function buildPlan(input: {
  name: string
  startDate: number
  weeks: number
  tasks: string[]
}): NewStudyPlan {
  const tasks = input.tasks.map(parseTaskLine).filter((task): task is PlanTask => task !== null)
  const weeks = Math.max(1, Math.min(Math.round(input.weeks), MAX_PLAN_WEEKS))

  return {
    name: input.name.trim(),
    startDate: startOfDay(input.startDate),
    weeks: Array.from({ length: weeks }, () => buildWeek(tasks)),
    createdAt: Date.now(),
  }
}

/** What a new week should start with: whatever the last one asks for, uncounted. */
export function templateFrom(plan: Pick<StudyPlan, 'weeks'>): PlanTask[] {
  const last = plan.weeks[plan.weeks.length - 1]
  const day = last?.days.find(entry => entry.tasks.length > 0)
  return (day?.tasks ?? []).map(task => ({ ...task, done: 0 }))
}
