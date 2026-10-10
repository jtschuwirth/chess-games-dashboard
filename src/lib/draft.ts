/**
 * A document you have edited but not saved, kept on the device.
 *
 * Written for study plans and generalised when opening studies needed the same thing,
 * which they do for the same reasons. A page that writes every keystroke to Firestore
 * loses data two ways at once: each write *replaces* the document and several in flight
 * are not ordered, so an earlier snapshot can land last and undo the edits after it; and
 * on a phone, switching app suspends the tab, so whatever had not been sent existed only
 * in React state.
 *
 * Saving is a button, and between presses the work lives here. localStorage is
 * synchronous and survives the tab being suspended, killed or reloaded — exactly the gap
 * that was losing the edits — and it is per device, which is the honest scope for "what I
 * was in the middle of".
 *
 * Every read and write is wrapped: a private window, blocked storage or a full quota must
 * cost you the draft, not the page.
 */

/** What is being drafted. Also the key's prefix, so two kinds cannot collide. */
export type DraftKind = 'plan' | 'study'

export interface Draft<T> {
  body: T
  /** When this device last touched it, so the page can say what it is restoring. */
  editedAt: number
}

/** Keyed by account as well as document: two sign-ins on one browser must not collide. */
function keyFor(kind: DraftKind, userId: string, docId: string): string {
  return `${kind}-draft:${userId}:${docId}`
}

/**
 * The draft on this device, or null when there is none worth restoring.
 *
 * `isBody` is the caller's own shape check — a stored value that is not the thing it
 * claims to be must be dropped here rather than throwing somewhere downstream.
 *
 * `legacyKey` names a field an older version of this module wrote the body under. Plans
 * were stored as `{ plan, editedAt }` before this was generalised, and a draft someone is
 * in the middle of is the one thing that must not be lost to a refactor of the thing
 * whose whole job is not losing it.
 */
export function readDraft<T>(
  kind: DraftKind,
  userId: string,
  docId: string,
  isBody: (body: unknown) => boolean,
  legacyKey?: string,
): Draft<T> | null {
  try {
    const stored = window.localStorage.getItem(keyFor(kind, userId, docId))
    if (!stored) return null

    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return null

    const record = parsed as Record<string, unknown>
    const body = record.body ?? (legacyKey ? record[legacyKey] : undefined)
    if (!isBody(body)) return null

    return {
      body: body as T,
      editedAt: typeof record.editedAt === 'number' ? record.editedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeDraft<T>(kind: DraftKind, userId: string, docId: string, body: T): void {
  try {
    const draft: Draft<T> = { body, editedAt: Date.now() }
    window.localStorage.setItem(keyFor(kind, userId, docId), JSON.stringify(draft))
  } catch {
    // the edit still stands on screen; it just will not outlive the tab
  }
}

export function clearDraft(kind: DraftKind, userId: string, docId: string): void {
  try {
    window.localStorage.removeItem(keyFor(kind, userId, docId))
  } catch {
    // nothing to do: the next save overwrites it anyway
  }
}

/**
 * Whether two documents differ, which is what "unsaved" means.
 *
 * Compared as JSON rather than field by field. Both sides are built by the same body
 * function, so the key order is the same on each — and a deep comparison written by hand
 * is a second definition of what the document is, which would rot against the first.
 */
export function bodyChanged(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
}

/**
 * Whether a draft is work another device has already moved past.
 *
 * A draft normally outranks the server, because it exists only where edits were made and
 * not saved — it is newer by definition. That stops being true the moment another device
 * saves: then restoring it would quietly undo whatever that device did. A document
 * written before `updatedAt` existed has none and falls back to the draft winning, which
 * is the safer way to be wrong — a visible banner offering Discard beats silently
 * dropping work nobody can get back.
 */
export function draftSuperseded(editedAt: number, savedAt: number | undefined): boolean {
  return savedAt !== undefined && editedAt < savedAt
}
