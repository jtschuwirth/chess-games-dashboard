/**
 * A plan you have edited but not saved, kept on the device.
 *
 * The mechanism and the reasoning both live in `lib/draft.ts` now, because opening
 * studies need the same thing for the same reasons. This is the plan-shaped door onto
 * it: the key is unchanged (`plan-draft:{uid}:{planId}`) and a draft written before the
 * generalisation is still read, through `legacyKey`, since a draft someone is in the
 * middle of is exactly what must not be lost to a refactor.
 */
import {
  bodyChanged,
  clearDraft as clearAnyDraft,
  readDraft as readAnyDraft,
  writeDraft as writeAnyDraft,
} from '@/lib/draft'
import type { NewStudyPlan } from '@/types/chess'

export interface PlanDraft {
  plan: NewStudyPlan
  /** When this device last touched it, so the page can say what it is restoring. */
  editedAt: number
}

/** A shape that is not a plan is not worth restoring, and must not throw later. */
function isPlan(body: unknown): boolean {
  return Boolean(body) && Array.isArray((body as NewStudyPlan)?.weeks)
}

export function readDraft(userId: string, planId: string): PlanDraft | null {
  const draft = readAnyDraft<NewStudyPlan>('plan', userId, planId, isPlan, 'plan')
  return draft ? { plan: draft.body, editedAt: draft.editedAt } : null
}

export function writeDraft(userId: string, planId: string, plan: NewStudyPlan): void {
  writeAnyDraft('plan', userId, planId, plan)
}

export function clearDraft(userId: string, planId: string): void {
  clearAnyDraft('plan', userId, planId)
}

export function planChanged(a: NewStudyPlan, b: NewStudyPlan): boolean {
  return bodyChanged(a, b)
}
