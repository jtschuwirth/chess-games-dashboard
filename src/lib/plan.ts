import { addDays, chessDayKey, dayKey, formatDay, formatShortDay, startOfDay } from './days'
import { hasReview } from './review'
import type {
  GameRecord,
  NewStudyPlan,
  PlanDay,
  PlanTask,
  PlanWeek,
  StudyPlan,
} from '@/types/chess'

export {
  DAY_MS,
  DAY_START_HOUR,
  addDays,
  chessDayKey,
  dayKey,
  formatDay,
  formatShortDay,
  startOfDay,
} from './days'

/** A week is the unit a plan is written in, so it is the unit a plan is made of. */
export const DAYS_PER_WEEK = 7

/** Longer than this and it stops being a plan and becomes a calendar. */
export const MAX_PLAN_WEEKS = 26

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
  return addDays(startOfDay(plan.startDate), offset)
}

/** The date of one day of one week. */
export function dayDate(
  plan: Pick<StudyPlan, 'startDate' | 'weeks'>,
  weekIndex: number,
  dayIndex: number,
): number {
  return dateAt(plan, dayOffset(plan, weekIndex, dayIndex))
}

/** "28 Sep – 4 Oct", the span a week or a plan covers. */
function rangeLabel(from: number, to: number): string {
  return `${formatShortDay(from)} – ${formatShortDay(to)}`
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

export interface RatingWindow {
  /** The day the stretch is measured from: the close before its first day. */
  start: string
  /** The day it is measured to. */
  end: string
  /** Whether the stretch is behind you, so the end is its own rather than today's. */
  over: boolean
}

/**
 * The two days a stretch of a plan is read between: what you were rated going into it,
 * and where it stands now.
 *
 * "Now" stops at the stretch's own last day once that day is behind you — a week that ran
 * in March answers for March, not for everything played since, and its end is therefore
 * the same number the week after it reads as its start. While a stretch is still running
 * the end is the last day anything is known about, which is today's rating: the history
 * carries the last close forward, so asking for today and asking for its own end give the
 * same number, and using its end keeps the clock out of a render.
 *
 * Null when nothing is known yet.
 */
function ratingWindow(
  from: number,
  to: number,
  lastKnownDay: string | undefined,
): RatingWindow | null {
  if (!lastKnownDay) return null

  const start = dayKey(addDays(from, -1))
  const finish = dayKey(to)
  const over = finish < lastKnownDay

  return { start, end: over ? finish : lastKnownDay, over }
}

/** The whole plan, day one to its last day. Null when it has no days. */
export function planRatingWindow(
  plan: Pick<StudyPlan, 'startDate' | 'weeks'>,
  lastKnownDay: string | undefined,
): RatingWindow | null {
  const length = plan.weeks.reduce((count, week) => count + week.days.length, 0)
  if (length === 0) return null

  return ratingWindow(dateAt(plan, 0), dateAt(plan, length - 1), lastKnownDay)
}

/** One week of it, on the same rule, so a week's end is the next week's start. */
export function weekRatingWindow(
  plan: Pick<StudyPlan, 'startDate' | 'weeks'>,
  weekIndex: number,
  lastKnownDay: string | undefined,
): RatingWindow | null {
  const days = plan.weeks[weekIndex]?.days.length ?? 0
  if (days === 0) return null

  return ratingWindow(dayDate(plan, weekIndex, 0), dayDate(plan, weekIndex, days - 1), lastKnownDay)
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
  // the same 6am boundary a game is filed by: at one in the morning you are still on
  // yesterday's day of the plan, which is the one the late session belongs to
  const key = chessDayKey(now)

  for (let week = 0; week < plan.weeks.length; week++) {
    for (let day = 0; day < plan.weeks[week].days.length; day++) {
      if (dayKey(dayDate(plan, week, day)) === key) return { week, day }
    }
  }
  return null
}

/* --------------------------------------------------------------------- games */

/**
 * The games you played on a given day, oldest first.
 *
 * Matched on when the game was *played*, not when it was reviewed. A day of a plan asks
 * you to play two rapid games, so the games that answer it are the ones played that day —
 * and a game played on Monday and taken apart on Tuesday belongs under Monday, where the
 * task was. Reviewing it later does not move it.
 *
 * Nothing links a game to a plan: the day knows its date and a game knows when it was
 * played, so the two meet without either storing the other. Nothing has to be kept in
 * step when a plan is edited or a game is reviewed again.
 */
export function gamesOn(games: GameRecord[], ms: number): GameRecord[] {
  const key = dayKey(ms)
  return games
    .filter(game => chessDayKey(game.playedAt) === key)
    .sort((a, b) => a.playedAt - b.playedAt)
}

/** How many of a day's games you have taken apart, for the day's own heading. */
export function reviewedCount(games: GameRecord[]): number {
  return games.filter(hasReview).length
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

/* ------------------------------------------------------------------- editing */

/** One task, said in the only terms that identify it: which day, and where in it. */
export interface TaskAt {
  week: number
  day: number
  index: number
}

export function sameTaskAt(a: TaskAt, b: TaskAt): boolean {
  return a.week === b.week && a.day === b.day && a.index === b.index
}

/**
 * Whether a gap is somewhere the task is not already.
 *
 * Within one day the gap above a task and the gap below it are both where it already is,
 * so two of the gaps on offer are not moves at all. This is here rather than in the drag
 * because it is a fact about moving a task: `moveTask` answers such a drop with the plan
 * it was given, and the drag draws no line for it, and those must be the same rule or the
 * page promises a move it will not make.
 *
 * It is the cheap half of the answer. A gap past the end of the day it is read against is
 * also not a move when the task is already last, and only `moveTask` knows that, because
 * only it has the day to clamp against.
 */
export function wouldMoveTask(from: TaskAt, to: TaskAt): boolean {
  if (from.week !== to.week || from.day !== to.day) return true
  return to.index !== from.index && to.index !== from.index + 1
}

/**
 * A task picked up in one place and put down in another, within a day or across days.
 *
 * `to.index` is an **insertion point read off the list as it is drawn** — the gap above
 * the task at that index — and not a destination slot. Those differ by one as soon as
 * the task comes out of the same day, because everything after it shifts up: dragging
 * the first task into the gap below the second is `to.index === 2` against a `from.index`
 * of 0, and inserting at 2 in the shortened list would put it back where it started.
 * Getting that wrong is the reorder bug every list makes once.
 *
 * The task record moves whole, counts included, because that is what it is: a task you
 * had done three of, moved to Thursday, is three done on Thursday. The plan's own total
 * cannot change, which is the check worth having.
 *
 * Out-of-range weeks, days and indices are clamped rather than refused — the drop target
 * is read off the DOM, and a folded day reports an append past the rows it is not
 * drawing — so no caller has to range-check first. A move that would change nothing
 * returns the plan it was given, so a press that went nowhere leaves nothing to save.
 */
export function moveTask(plan: StudyPlan, from: TaskAt, to: TaskAt): StudyPlan {
  if (!wouldMoveTask(from, to)) return plan

  const source = plan.weeks[from.week]?.days[from.day]
  const target = plan.weeks[to.week]?.days[to.day]
  const task = source?.tasks[from.index]
  if (!source || !target || !task) return plan

  const sameDay = from.week === to.week && from.day === to.day
  const gap = Math.max(0, Math.min(to.index, target.tasks.length))
  const at = sameDay && gap > from.index ? gap - 1 : gap
  if (sameDay && at === from.index) return plan

  return {
    ...plan,
    weeks: plan.weeks.map((week, w) => {
      if (w !== from.week && w !== to.week) return week

      return {
        ...week,
        days: week.days.map((day, d) => {
          const takeFrom = w === from.week && d === from.day
          const giveTo = w === to.week && d === to.day
          if (!takeFrom && !giveTo) return day

          let tasks = day.tasks
          if (takeFrom) tasks = tasks.filter((_, i) => i !== from.index)
          if (giveTo) tasks = [...tasks.slice(0, at), task, ...tasks.slice(at)]
          return { ...day, tasks }
        }),
      }
    }),
  }
}

/* ------------------------------------------------------------ saving one day */

/** Whether a day differs from the copy Firestore has. */
export function dayChanged(a: PlanDay | undefined, b: PlanDay | undefined): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
}

/**
 * The stored plan with one day replaced, for saving that day and nothing else.
 *
 * The whole document still goes to Firestore — a plan is one document and a day is an
 * entry two arrays deep, so there is nothing smaller to write. What makes it a partial
 * save is *what* is written: the server's own copy with this one day put into it, so
 * every other edit on the device stays a draft and nothing you were still in the middle
 * of is committed by a press you made somewhere else.
 *
 * **The plan's shape is the plan's**, taken from the baseline and left alone: how many
 * weeks there are, how many days each holds, what the weeks are called. Changing any of
 * that is a change to the plan rather than to a day, and belongs to Save changes.
 *
 * Null where the baseline has no such day, which is a week added on this device and not
 * yet saved. The exercise sheet inserts an exercise the server has never seen, and this
 * cannot do the same thing: an exercise is a leaf, so inserting it commits only itself,
 * while a week is seven days and inserting one would commit six you had not pressed.
 */
export function planWithDay(
  stored: NewStudyPlan,
  at: PlanPosition,
  day: PlanDay,
): NewStudyPlan | null {
  if (!stored.weeks[at.week]?.days[at.day]) return null

  return {
    ...stored,
    weeks: stored.weeks.map((week, w) =>
      w !== at.week
        ? week
        : {
            ...week,
            days: week.days.map((entry, d) => (d === at.day ? day : entry)),
          },
    ),
  }
}
