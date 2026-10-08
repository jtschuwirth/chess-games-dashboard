'use client'

import { ARC_BADGE, ARC_LABEL, ARCS, GAME_NAMES, OFF_BOARD, TEXTURES, TEXTURE_LABEL } from '@/lib/shape'
import { settings } from '@/lib/settings'

/**
 * Where a game's descriptor comes from.
 *
 * It is rendered from the same two tables the code reads, not a prose copy of them, for
 * the reason `TRANSITIONS` has its own screen: an explanation written separately from the
 * rule explains what the rule used to be.
 */
export default function GameShapePanel() {
  const config = settings()
  const level = (config.level / 100).toFixed(2)

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-sm">What a game is called</h2>
        <p className="text-xs text-zinc-500 max-w-prose">
          Three readings off the evaluations the engine already stored, plus the result and
          how the game ended. Nothing here is saved — change a band and every game is
          renamed on the next read.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">What is measured</h3>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Measure name="the result">
            Win, draw or loss. It picks the family, so a name can never disagree with the
            point you actually got.
          </Measure>
          <Measure name="peak and trough">
            The best and worst the evaluation ever reached, in your frame, each read as a
            band. They say whether you ever had it and whether you were ever lost.
          </Measure>
          <Measure name="lead changes">
            How many times the evaluation crossed from past <Cp>+{level}</Cp> to past{' '}
            <Cp>−{level}</Cp> or back. It has to leave the level band to count: drifting
            between <Cp>+0.1</Cp> and <Cp>−0.1</Cp> is not the lead changing hands, and
            dropping back into level does not lose you a lead you already had.
          </Measure>
          <Measure name="the ending">
            Checkmate, resignation, a flag, a repetition. Read only when the result and the
            final evaluation disagree — which is where it is the whole story.
          </Measure>
        </dl>
        <p className="text-xs text-zinc-600">
          Evaluations are squeezed into ±10.00 first, so one forced mate is not the whole of
          a game&apos;s measured movement.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">
          What became of the lead, and how often it moved
        </h3>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[34rem]">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-zinc-500">
                <th className="text-left font-normal px-5 py-2">The arc</th>
                <th className="text-left font-normal px-3 py-2">When</th>
                {TEXTURES.map(texture => (
                  <th key={texture} className="text-left font-normal px-3 py-2">
                    {TEXTURE_LABEL[texture]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {ARCS.map(arc => (
                <tr key={arc}>
                  <td className="px-5 py-2">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${ARC_BADGE[arc]}`}
                    >
                      {ARC_LABEL[arc]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{WHEN[arc]}</td>
                  {TEXTURES.map(texture => (
                    <td key={texture} className="px-3 py-2 text-zinc-300">
                      {GAME_NAMES[arc][texture]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-600">
          `steady` is no lead change, `turned once` is one, `traded` is two or more. Two
          cells cannot happen — you cannot throw a won game or rescue a lost one without
          the lead moving — and are filled so nothing can fall through the table.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">
          When the board was sending it elsewhere
        </h3>
        <p className="text-xs text-zinc-500 max-w-prose">
          About one game in twenty-five. The ending names those outright, because it is what
          actually settled them and no reading of the evaluations ever will. The arc still
          applies underneath, which is why such a game can be both{' '}
          <span className="text-zinc-300">saved by the flag</span> and{' '}
          <span className="text-zinc-300">recovered</span> on the table above.
        </p>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[32rem]">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-zinc-500">
                <th className="text-left font-normal px-5 py-2">You got</th>
                <th className="text-left font-normal px-3 py-2">The board said</th>
                <th className="text-left font-normal px-3 py-2">It ended by</th>
                <th className="text-left font-normal px-3 py-2">Called</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {OFF_BOARD.map((row, index) => (
                <tr key={index}>
                  <td className="px-5 py-2 text-zinc-400">{row.result}</td>
                  <td className="px-3 py-2 text-zinc-400">{BOARD_WORD[row.board]}</td>
                  <td className="px-3 py-2 text-zinc-500 text-xs">
                    {row.endings.length > 0 ? row.endings.join(', ') : 'anything else'}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/** When each arc applies, in the order the code asks the questions. */
const WHEN: Record<string, string> = {
  held: 'you won and were never lost',
  recovered: 'you won from a position that was lost',
  threw: 'you lost a game you once had won',
  'never-had-it': 'you lost one you never had won',
  shared: 'it was drawn',
}

/** `board` is from your side, so a board that said loss was sending the point to them. */
const BOARD_WORD: Record<string, string> = {
  win: 'you were winning',
  draw: 'level',
  loss: 'they were winning',
}

function Measure({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-zinc-300">{name}</dt>
      <dd className="text-zinc-500 leading-snug">{children}</dd>
    </div>
  )
}

function Cp({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-zinc-400">{children}</span>
}
