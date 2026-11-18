import { COLOR_LABEL, type OpeningColor } from '@/types/chess'

/**
 * Which side, as the thing it is rather than as a word in brackets.
 *
 * The game header has drawn this dot beside the result for as long as there has been a
 * game view, and everywhere else named a colour by sticking `(Black)` on the end of a
 * name — so an opening route read `English Opening (Black) › Queen's Pawn Game (Black) ›
 * Queen's Gambit Declined (Black) › Catalan Opening (Black)`, four brackets saying one
 * thing you already knew from the dot two lines above.
 *
 * A dot is the same fact and takes no width, which is the whole reason it can be drawn
 * once at the front of a route or inside a pill without crowding the name it belongs to.
 * The word is still there on hover, since a black dot on a dark panel is a ring rather
 * than something you can read.
 *
 * `any` draws nothing at all. A line saved for neither side has no colour to report, and
 * a third dot meaning "no colour" would be a mark you have to learn in order to ignore.
 */
export default function ColorDot({
  color,
  /**
   * The size, as its own prop rather than something to append.
   *
   * Tailwind resolves a duplicated utility by the order of the *stylesheet*, not of the
   * class list, so `w-2 … w-2.5` is a coin toss that happened to land right. One slot
   * for the size cannot be overridden by accident.
   */
  size = 'w-2 h-2',
  className = '',
}: {
  color: OpeningColor
  size?: string
  className?: string
}) {
  if (color === 'any') return null

  return (
    <span
      title={COLOR_LABEL[color]}
      aria-label={COLOR_LABEL[color]}
      role="img"
      className={`inline-block ${size} rounded-full shrink-0 align-middle ${
        color === 'white' ? 'bg-zinc-100' : 'bg-zinc-950 ring-1 ring-zinc-500'
      } ${className}`}
    />
  )
}
