/**
 * What has been done to a game, as a bordered pill: reviewed, and analysed at a depth —
 * or analysed by a build whose numbers no longer count, which is the third state.
 *
 * One component for both views rather than two copies of the same class list, because
 * the whole point of these markers is that a row in the list and the title of the game
 * it opens say the same thing in the same way — and that is exactly the kind of agreement
 * that rots when it lives in two files.
 *
 * Status is a tag; findings are a figure. What the engine *found* — `2?? 1?` — is written
 * plainly beside these rather than wrapped in one, because a count is a measurement and
 * putting a border round it made the header read as though the number of blunders were
 * somehow 21-ish.
 */
const TONES = {
  /** Your own work on the game. */
  review: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  /**
   * The engine's. Violet rather than the yellow it used to be: yellow sat in the same
   * family as the amber a mistake is written in, so a depth and a mistake count side by
   * side read as one thing in two shades.
   */
  engine: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  /**
   * The engine's, but from a build whose numbers no longer match. Amber rather than
   * violet because it is a thing to act on, and amber is already what this app uses for
   * "worth your attention but nothing is broken".
   */
  stale: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
} as const

export type TagTone = keyof typeof TONES

export default function StatusTag({
  tone,
  mono = false,
  title,
  children,
}: {
  tone: TagTone
  /** Numbers line up better in mono — the depth tag uses it, the review tag does not. */
  mono?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={`px-2 py-0.5 text-xs rounded-full border shrink-0 ${
        mono ? 'font-mono' : ''
      } ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
