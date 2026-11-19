'use client'

import { METHOD_PASSES } from '@/lib/daily'

/**
 * The move loop, written out.
 *
 * It renders `METHOD_PASSES` rather than describing it, the rule the transition table
 * and the game-shape panel already follow: an explanation written separately explains
 * what the method used to be. A step added to the table appears here and in the form at
 * the same moment, which is the only way the two can be trusted to agree.
 *
 * The gate between Pass 1 and Pass 2 is drawn as its own row because it is the one
 * branch in the whole procedure, and reading the passes as a straight list of four
 * hides exactly the thing worth internalising.
 */
export default function MethodCard() {
  return (
    <div className="flex flex-col gap-3">
      {METHOD_PASSES.map(pass => (
        <div key={pass.id} className="flex flex-col gap-2">
          {pass.gate && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-1">
              <span className="h-px w-4 shrink-0 bg-zinc-800" />
              <span className="min-w-0">{pass.gate}</span>
              <span className="h-px flex-1 bg-zinc-800" />
            </div>
          )}

          <div className={`border-l-2 ${pass.border} pl-4 flex flex-col gap-2`}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-xs font-mono ${pass.tone}`}>Pass {pass.number}</span>
              <span className="text-sm font-semibold text-zinc-100">{pass.title}</span>
              {pass.branch === 'quiet' && (
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  quiet positions only
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-500 max-w-2xl">{pass.summary}</p>

            <ol className="flex flex-col gap-1.5">
              {pass.steps.map((step, index) => (
                <li key={step.id} className="text-xs text-zinc-300 flex gap-2">
                  <span className="text-zinc-600 font-mono shrink-0">
                    {pass.number}.{index + 1}
                  </span>
                  <span className="min-w-0">
                    {step.label}
                    {step.checklist && (
                      <span className="text-zinc-600"> — {step.checklist.join(' · ')}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ))}

      <div className="border-l-2 border-zinc-700 pl-4 flex flex-col gap-1">
        <span className="text-sm font-semibold text-zinc-100">Every move, either branch</span>
        <p className="text-xs text-zinc-500 max-w-2xl">
          What the position is worth, from White&rsquo;s side, and the line that value is
          the value of. The number alone cannot say whether a disagreement with the engine
          was a line you missed or a position you misjudged.
        </p>
      </div>
    </div>
  )
}
