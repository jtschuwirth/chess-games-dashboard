'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sameTaskAt, wouldMoveTask, type TaskAt } from '@/lib/plan'

/**
 * Carrying a task from one place in a plan to another.
 *
 * **Pointer events rather than HTML5 drag and drop**, because this is the page you tick
 * off on a phone and `dragstart` never fires for a finger. One code path covers a mouse,
 * a finger and a pen, at the price of drawing the feedback ourselves.
 *
 * The drop target is **read off the DOM** at the pointer rather than from a registry of
 * rectangles kept in step with the layout: `elementFromPoint` finds the day card and the
 * rows inside it say where their own gaps are. A registry would be a second description
 * of where things are, and the first one — the page — moves whenever a day folds, a note
 * grows a line, or the list scrolls under a still finger.
 */

/* -------------------------------------------------------------- the DOM side */

/**
 * One spelling of each attribute, used to write it and to look for it. `as const` is what
 * makes the computed keys below literal types rather than an index signature, so the
 * objects can be spread straight onto an element.
 */
const ATTRS = {
  day: 'data-plan-day',
  tasks: 'data-plan-tasks',
  slot: 'data-plan-task',
  ghost: 'data-plan-ghost',
} as const

/**
 * What a day card has to say about itself to be a place a task can land.
 *
 * The count is there for the **folded** card, which draws none of its rows and is still
 * somewhere to put a task — with no rows to measure against, a drop appends, and the only
 * thing that knows how many are already there is the card.
 */
export function dropTarget(week: number, day: number, tasks: number) {
  return { [ATTRS.day]: `${week}:${day}`, [ATTRS.tasks]: tasks }
}

/** What a task row has to say: the gap above it is its own index. */
export function dropSlot(index: number) {
  return { [ATTRS.slot]: index }
}

/**
 * What the label following the pointer has to say, so the drag can find it.
 *
 * Found by attribute rather than handed over as a ref, which is the same bargain the drop
 * targets make one level up: the page is already the description of where things are, and
 * a ref would be a second one to keep in step — for an element whose position is written
 * by hand on every frame and never read by a render.
 */
export function ghostTarget() {
  return { [ATTRS.ghost]: '' }
}

/** Which gap the pointer is over, or null when it is over nothing that takes a task. */
function gapAt(x: number, y: number): TaskAt | null {
  const card = document.elementFromPoint(x, y)?.closest<HTMLElement>(`[${ATTRS.day}]`) ?? null
  if (!card) return null

  const [week, day] = (card.getAttribute(ATTRS.day) ?? '').split(':').map(Number)
  if (!Number.isInteger(week) || !Number.isInteger(day)) return null

  // past the last row by default, which is also the answer for a card drawing no rows
  let index = Number(card.getAttribute(ATTRS.tasks) ?? 0)

  for (const row of Array.from(card.querySelectorAll<HTMLElement>(`[${ATTRS.slot}]`))) {
    const box = row.getBoundingClientRect()
    if (y < box.top + box.height / 2) {
      index = Number(row.getAttribute(ATTRS.slot))
      break
    }
  }

  return { week, day, index }
}

/* ---------------------------------------------------------------- scrolling */

/** How close to an edge starts scrolling, and how fast it goes at the very edge. */
const EDGE = 72
const SPEED = 20

/**
 * The thing that actually scrolls, which on this app is **not the window**: `PageShell`
 * puts the page in a full-height column with its own `overflow-y-auto`, so scrolling the
 * document does nothing at all. Found by walking up from the grip rather than named, so
 * the hook does not have to know the shell it is living in.
 */
function scrollerOf(node: HTMLElement | null): HTMLElement | null {
  for (let element = node; element; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && element.scrollHeight > element.clientHeight) {
      return element
    }
  }
  return null
}

/**
 * Scroll when the pointer is held near an edge, and say whether it moved — which is what
 * decides whether the gap has to be worked out again, since the page has moved under a
 * finger that has not.
 *
 * Without this a plan is only reorderable within what fits on the screen: an open week is
 * seven day cards, so the day you want is usually below the fold, and on a phone always.
 */
function edgeScroll(scroller: HTMLElement | null, y: number): boolean {
  if (!scroller) return false

  const box = scroller.getBoundingClientRect()
  const above = y - box.top
  const below = box.bottom - y

  let by = 0
  if (above < EDGE) by = -SPEED * (1 - Math.max(0, above) / EDGE)
  else if (below < EDGE) by = SPEED * (1 - Math.max(0, below) / EDGE)
  if (by === 0) return false

  const was = scroller.scrollTop
  scroller.scrollTop = was + by
  return scroller.scrollTop !== was
}

/* ------------------------------------------------------------------ the hook */

/** Far enough to mean it. Below this a press on the grip is a press, not a drag. */
const THRESHOLD = 4

interface Carrying {
  from: TaskAt
  /** What the task is called, for the label that follows the pointer. */
  label: string
  /** The gap it would land in, or null while the pointer is somewhere that takes nothing. */
  over: TaskAt | null
}

interface Live extends Carrying {
  pointer: number
  x: number
  y: number
  fromX: number
  fromY: number
  started: boolean
  scroller: HTMLElement | null
  /** The label, once there is one to find: it is drawn by the render that starts the drag. */
  ghost: HTMLElement | null
  frame: number
  /** One abort for every listener this drag added, so ending it is a single call. */
  abort: AbortController
}

export interface TaskDragController {
  /** Whether this exact task is the one in hand, so its own row can say so. */
  isCarrying: (at: TaskAt) => boolean
  /** Where a day should draw the line, or null when the task would not land in it. */
  insertionAt: (week: number, day: number) => number | null
  /** Pick a task up, from the grip's own `pointerdown`. */
  grab: (at: TaskAt, label: string, event: React.PointerEvent) => void
  /** Move one with no pointer involved, which is what the grip's arrow keys do. */
  move: (from: TaskAt, to: TaskAt) => void
  /** What is in hand, for the page to draw a label for. Null when nothing is. */
  carrying: Carrying | null
}

function transformFor(x: number, y: number): string {
  // beside and above the pointer, because under a finger is behind a finger
  return `translate3d(${Math.round(x) + 14}px, ${Math.round(y) - 34}px, 0)`
}

/** Two gaps, either of which may be nowhere. */
function sameGap(a: TaskAt | null, b: TaskAt | null): boolean {
  return a === null || b === null ? a === b : sameTaskAt(a, b)
}

export function useTaskDrag(onMove: (from: TaskAt, to: TaskAt) => void): TaskDragController {
  const [carrying, setCarrying] = useState<Carrying | null>(null)

  /**
   * The pointer's position never goes into state.
   *
   * A drag is forty moves a second and this page draws a week of day cards with their
   * games under them, so a render per move would be exactly that. The only thing that has
   * to follow the pointer is one floating label, and writing its transform by hand is
   * both cheaper and smoother than re-rendering the plan to move it. State changes when
   * the *answer* changes — which gap the task would land in — and not before.
   */
  const live = useRef<Live | null>(null)

  /** The page's own handler, read at the moment of the drop rather than captured. */
  const commit = useRef(onMove)
  useEffect(() => {
    commit.current = onMove
  }, [onMove])

  const end = useCallback(() => {
    const current = live.current
    if (!current) return

    live.current = null
    current.abort.abort()
    if (current.frame) cancelAnimationFrame(current.frame)
    if (current.started) document.body.style.userSelect = ''
    setCarrying(null)
  }, [])

  /* a drag left running in an unmounted page would keep listening to the window */
  useEffect(() => end, [end])

  const grab = useCallback(
    (at: TaskAt, label: string, event: React.PointerEvent) => {
      if (live.current) return
      if (event.pointerType === 'mouse' && event.button !== 0) return

      const current: Live = {
        from: at,
        label,
        over: null,
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        fromX: event.clientX,
        fromY: event.clientY,
        started: false,
        scroller: scrollerOf(event.currentTarget as HTMLElement),
        ghost: null,
        frame: 0,
        abort: new AbortController(),
      }
      live.current = current

      const look = () => {
        const over = gapAt(current.x, current.y)
        if (sameGap(over, current.over)) return
        current.over = over
        setCarrying(was => (was ? { ...was, over } : was))
      }

      /**
       * One frame of a drag: the label goes where the pointer is, and the page scrolls if
       * the pointer is held at an edge.
       *
       * The label is placed here rather than from `pointermove` because this runs after
       * the render that created it — and because a frame is when a position is worth
       * writing. A scroll moves the page under a finger that has not moved, so the gap
       * has to be worked out again.
       */
      const tick = () => {
        if (live.current !== current) return

        if (!current.ghost) {
          current.ghost = document.querySelector<HTMLElement>(`[${ATTRS.ghost}]`)
        }
        if (current.ghost) current.ghost.style.transform = transformFor(current.x, current.y)

        if (edgeScroll(current.scroller, current.y)) look()
        current.frame = requestAnimationFrame(tick)
      }

      const { signal } = current.abort

      window.addEventListener(
        'pointermove',
        moved => {
          if (moved.pointerId !== current.pointer) return
          current.x = moved.clientX
          current.y = moved.clientY

          if (!current.started) {
            const far =
              Math.abs(current.x - current.fromX) + Math.abs(current.y - current.fromY) >= THRESHOLD
            if (!far) return

            current.started = true
            // a mouse drag over the task's own text field would otherwise select it
            document.body.style.userSelect = 'none'
            current.over = gapAt(current.x, current.y)
            setCarrying({ from: current.from, label: current.label, over: current.over })
            current.frame = requestAnimationFrame(tick)
            return
          }

          look()
        },
        { signal },
      )

      window.addEventListener(
        'pointerup',
        lifted => {
          if (lifted.pointerId !== current.pointer) return
          const { from, over, started } = current
          end()
          // a drop on a gap that changes nothing is let through: `moveTask` answers it
          // with the plan it was given, so there is one rule about that and it is there
          if (started && over) commit.current(from, over)
        },
        { signal },
      )

      window.addEventListener('pointercancel', () => end(), { signal })
      window.addEventListener(
        'keydown',
        pressed => {
          if (pressed.key === 'Escape') end()
        },
        { signal },
      )
    },
    [end],
  )

  const insertionAt = useCallback(
    (week: number, day: number): number | null => {
      const over = carrying?.over
      if (!carrying || !over) return null
      if (over.week !== week || over.day !== day) return null
      /*
        Nothing is drawn for a gap the task is already in — within a day, the gap above it
        and the gap below it are both where it is — because a line promising a move that
        will not happen is worse than no line. The rule is the plan's own, so what the
        page draws and what a drop does cannot disagree about it.
      */
      return wouldMoveTask(carrying.from, over) ? over.index : null
    },
    [carrying],
  )

  const isCarrying = useCallback(
    (at: TaskAt) => carrying !== null && sameTaskAt(carrying.from, at),
    [carrying],
  )

  const move = useCallback((from: TaskAt, to: TaskAt) => commit.current(from, to), [])

  return { isCarrying, insertionAt, grab, move, carrying }
}
