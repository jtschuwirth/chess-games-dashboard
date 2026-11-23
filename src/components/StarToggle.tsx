/**
 * Worth meeting again — the mark that says which positions you want drilled.
 *
 * One component, because it is the same judgement on two documents: a review entry's
 * move and a whole sheet of exercises. The hue would otherwise be the thing to drift,
 * and a mark meaning two shades of the same thing is a mark you have to stop and read.
 *
 * Drawn rather than set as ★, the board's own lesson about glyphs: a character renders
 * differently per font and can render as nothing at all, and the filled and hollow
 * states reading apart is the entire control. Amber, which is what a mistake is written
 * in everywhere here — this marks the mistake you want back, not a status the engine or
 * a review produced.
 */
export default function StarToggle({
  on,
  onToggle,
  label,
  title,
  size = 'w-4 h-4',
}: {
  on: boolean
  onToggle: () => void
  /** What starring this one means, for the screen reader and the tooltip. */
  label: string
  /** Overrides the tooltip where the state wants spelling out. */
  title?: string
  size?: string
}) {
  const said = title ?? (on ? `Starred — ${label}` : label)

  return (
    <button
      type="button"
      onClick={onToggle}
      title={said}
      aria-label={said}
      aria-pressed={on}
      className={`shrink-0 flex items-center justify-center transition-colors ${
        on ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-600 hover:text-zinc-300'
      }`}
    >
      <svg viewBox="0 0 24 24" className={size} aria-hidden="true">
        <path
          d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.2 6.6L12 17.7l-5.9 3.1 1.2-6.6L2.5 9.5l6.6-.9L12 2.5z"
          fill={on ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
