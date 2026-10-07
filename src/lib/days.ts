/**
 * What day something happened on.
 *
 * Lives on its own because two unrelated things need it — a plan's days and the rating
 * history — and having either import the other would be a cycle.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * When a chess day starts. A game at one in the morning belongs to the evening it came
 * out of, not to the day that has just started, so a late session counts against the day
 * you sat down to play.
 */
export const DAY_START_HOUR = 6

/**
 * Local midnight for a moment. Days are counted as days you lived through, not as
 * 24-hour blocks from whenever something happened.
 */
export function startOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** `YYYY-MM-DD` in local time, which is what makes two moments the same calendar day. */
export function dayKey(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Which day a *game* belongs to, which is not always the calendar day it was played on.
 *
 * Stepping back a calendar day rather than subtracting six hours of milliseconds keeps
 * this right across a clock change, for the same reason dates are added on the calendar.
 */
export function chessDayKey(ms: number): string {
  const date = new Date(ms)
  if (date.getHours() >= DAY_START_HOUR) return dayKey(ms)

  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime())
}

/** The year a day key belongs to, which is how the history is sharded. */
export function yearOf(key: string): string {
  return key.slice(0, 4)
}

/** A day key back to local midnight of that day, for formatting and arithmetic. */
export function keyToDate(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

/**
 * The day `offset` days after a moment, counted on the calendar.
 *
 * Adding `offset * DAY_MS` is wrong twice a year: a day is 23 or 25 hours across a clock
 * change, so milliseconds land an hour short and every later day reads as the one before
 * it at 23:00.
 */
export function addDays(ms: number, offset: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).getTime()
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Mon 29 Sep", written out rather than handed to `toLocaleDateString`.
 *
 * The locale version renders differently on the server and in the browser — 04/10/2026
 * against 10/4/2026 — which React reports as a hydration mismatch.
 */
export function formatDay(ms: number): string {
  const date = new Date(ms)
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/**
 * "Sun 5 Oct, 14:20", spelled out rather than handed to `toLocaleString`, which renders
 * one way on the server and another in the browser and makes React cry hydration.
 */
export function formatMoment(ms: number): string {
  const date = new Date(ms)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDay(ms)}, ${hours}:${minutes}`
}

/** "28 Sep", for an axis where the weekday is noise. */
export function formatShortDay(ms: number): string {
  const date = new Date(ms)
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/**
 * "7 Oct 2023 – 3 Oct 2026", or "28 Sep – 4 Oct" inside one year.
 *
 * The year is not decoration: without it a three-year span renders as "7 Oct – 3 Oct",
 * which reads as four days backwards.
 */
export function formatRange(from: number, to: number): string {
  const a = new Date(from)
  const b = new Date(to)

  if (a.getFullYear() === b.getFullYear()) {
    return `${formatShortDay(from)} – ${formatShortDay(to)}`
  }
  return `${formatShortDay(from)} ${a.getFullYear()} – ${formatShortDay(to)} ${b.getFullYear()}`
}
