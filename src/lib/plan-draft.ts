/**
 * A plan you have edited but not saved, kept on the device.
 *
 * The plan page used to write the whole document to Firestore on every tick, stepper
 * press and note. That is what lost data, in two ways at once. Each write *replaces* the
 * document, and several in flight at once are not guaranteed to land in the order they
 * were sent — so an earlier snapshot could arrive last and quietly undo the three edits
 * after it. And on a phone, switching app suspends the tab: whatever had not yet reached
 * the server existed only in React state, so coming back showed whatever did.
 *
 * Saving is a button now, and between presses the work lives here. localStorage is
 * synchronous and survives the tab being suspended, killed or reloaded, which is exactly
 * the gap that was losing the edits — and it is per device, which is the honest scope for
 * "what I was in the middle of".
 *
 * Every read and write is wrapped: a private window, blocked storage or a full quota must
 * cost you the draft, not the page.
 */
import type { NewStudyPlan } from '@/types/chess'

export interface PlanDraft {
  plan: NewStudyPlan
  /** When this device last touched it, so the page can say what it is restoring. */
  editedAt: number
}

/** Keyed by account as well as plan: two sign-ins on one browser must not collide. */
function keyFor(userId: string, planId: string): string {
  return `plan-draft:${userId}:${planId}`
}

export function readDraft(userId: string, planId: string): PlanDraft | null {
  try {
    const stored = window.localStorage.getItem(keyFor(userId, planId))
    if (!stored) return null

    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return null

    const draft = parsed as PlanDraft
    // a shape that is not a plan is not worth restoring, and must not throw later
    if (!draft.plan || !Array.isArray(draft.plan.weeks)) return null

    return draft
  } catch {
    return null
  }
}

export function writeDraft(userId: string, planId: string, plan: NewStudyPlan): void {
  try {
    const draft: PlanDraft = { plan, editedAt: Date.now() }
    window.localStorage.setItem(keyFor(userId, planId), JSON.stringify(draft))
  } catch {
    // the edit still stands on screen; it just will not outlive the tab
  }
}

export function clearDraft(userId: string, planId: string): void {
  try {
    window.localStorage.removeItem(keyFor(userId, planId))
  } catch {
    // nothing to do: the next save overwrites it anyway
  }
}

/**
 * Whether two plans differ, which is what "unsaved" means.
 *
 * Compared as JSON rather than field by field. Both sides are built by `planBody` from
 * the same shapes, so the key order is the same on each — and a deep comparison written
 * by hand is a second definition of what a plan is, which would rot against the first.
 */
export function planChanged(a: NewStudyPlan, b: NewStudyPlan): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
}
