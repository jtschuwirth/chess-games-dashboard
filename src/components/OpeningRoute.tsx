import type { RouteStep } from '@/lib/opening'

/**
 * How a game got to the saved line it ended up in.
 *
 * `Caro Kann › Exchange Variation › Panov Attack` is a game that played its way down
 * its own chain; `Queen's Gambit Declined → Panov Attack` is the same destination
 * reached by a move order saved for something else. The separator is the whole of the
 * difference, so a game with nothing to report reads exactly as it always has and
 * nothing new is added to a row you are scanning.
 *
 * The arrow is a weight, not a hue. Every colour in this app already means something —
 * red a blunder, amber a mistake, violet the engine — and a transposition is not a
 * fault, so it earns a brighter grey and nothing more.
 *
 * One component rather than one per screen, because the dashboard list and the game
 * view both draw it and a route that read two ways would be two vocabularies for one
 * fact. They differ only in whether the names carry their colour suffix.
 */
export default function OpeningRoute({
  steps,
  className = 'text-zinc-400',
}: {
  steps: RouteStep[]
  className?: string
}) {
  const transposed = steps.filter(step => step.transposed)

  return (
    <span className={className} title={title(steps, transposed)}>
      {steps.map((step, index) => (
        <span key={`${step.name}-${index}`}>
          {index > 0 && (
            <span className={step.transposed ? 'text-zinc-400' : 'text-zinc-700'}>
              {step.transposed ? ' → ' : ' › '}
            </span>
          )}
          {step.name}
        </span>
      ))}
    </span>
  )
}

/**
 * The glyph said in words, since a `→` is only obvious once you know.
 *
 * A route whose *first* step is the transposition has no saved line in front of it to
 * have come from — nothing you have written down was played — so it says that instead
 * of naming a predecessor it does not have.
 */
function title(steps: RouteStep[], transposed: RouteStep[]): string {
  if (transposed.length === 0) return 'The saved lines this game played through'

  return transposed
    .map(step => {
      const from = steps[steps.indexOf(step) - 1]
      return from
        ? `Transposed into ${step.name} from ${from.name}`
        : `Reached ${step.name} by a move order you have not saved`
    })
    .join('. ')
}
