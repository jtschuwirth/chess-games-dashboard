import ColorDot from '@/components/ColorDot'
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
 * fact. Nothing differs between them any more: the colour used to, and does not.
 *
 * **The colour is one dot at the front, not a bracket on every name.** `openingLabel`
 * glued `(Black)` onto each step, so a four-step route said it four times — about a
 * repertoire that is all one colour by construction, under a header that had already
 * said it once. It is drawn at the first step that names a side, because every step
 * after it is that side too: `canNest` will not file a Black line under a White parent,
 * so the only thing a later step can add is a colour where the root had none.
 */
export default function OpeningRoute({
  steps,
  className = 'text-zinc-400',
}: {
  steps: RouteStep[]
  className?: string
}) {
  const transposed = steps.filter(step => step.transposed)
  /* the first step that names a side; every step past it is the same one */
  const colored = steps.findIndex(step => step.color !== 'any')

  return (
    <span className={className} title={title(steps, transposed)}>
      {steps.map((step, index) => (
        <span key={`${step.name}-${index}`}>
          {index > 0 && (
            <span className={step.transposed ? 'text-zinc-400' : 'text-zinc-700'}>
              {step.transposed ? ' → ' : ' › '}
            </span>
          )}
          {index === colored && <ColorDot color={step.color} className="mr-1.5 -mt-px" />}
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
 *
 * What it transposed *into* can be several names: a line whose parents were skipped
 * brings them along, and they are the rest of one destination rather than steps of
 * their own. So the sentence takes the whole run — the arrow and every `under` step
 * after it — and reads "into with 4.Nf3 › 5. c3", which is the thing that was reached.
 */
function title(steps: RouteStep[], transposed: RouteStep[]): string {
  if (transposed.length === 0) return 'The saved lines this game played through'

  return transposed
    .map(step => {
      const at = steps.indexOf(step)
      const into: string[] = []
      for (let next = at; next < steps.length; next++) {
        into.push(steps[next].name)
        if (!steps[next].under) break
      }

      const from = steps[at - 1]
      const name = into.join(' › ')
      return from
        ? `Transposed into ${name} from ${from.name}`
        : `Reached ${name} by a move order you have not saved`
    })
    .join('. ')
}
