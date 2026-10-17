'use client'

import { useMemo, useState } from 'react'
import MoveTreeBoard from '@/components/MoveTreeBoard'
import {
  ESSENTIALS_SECTIONS,
  commentedNodes,
  hasMethod,
  lineHome,
  lineOrientation,
  lineTree,
  pointText,
} from '@/lib/pattern'
import { moveLabel, type Path } from '@/lib/movetree'
import type { PatternLine, PatternRecord } from '@/types/chess'

/**
 * (i), (ii), (iii) — how the method itself letters its points, which is why `pointText`
 * strips any numbering you typed rather than printing `(i) (I)`.
 *
 * Only ever a handful per question, so the numerals stop where they stop being read at a
 * glance; past that it falls back to the figure, which is the honest thing to show.
 */
const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
const roman = (n: number) => NUMERALS[n - 1] ?? String(n)

/** What each kind of answer looks like. Keyed by the tone the sections table carries. */
const TONE = {
  neutral: {
    box: 'border-zinc-800 bg-zinc-900/60',
    marker: 'bg-zinc-800 text-zinc-400',
    title: 'text-zinc-200',
  },
  breaks: {
    box: 'border-rose-900/50 bg-rose-950/20',
    marker: 'bg-rose-500/15 text-rose-300',
    title: 'text-rose-200/90',
  },
  survives: {
    box: 'border-emerald-900/50 bg-emerald-950/20',
    marker: 'bg-emerald-500/15 text-emerald-300',
    title: 'text-emerald-200/90',
  },
} as const

/**
 * A pattern as something to study rather than a document to read down.
 *
 * The old layout put four boxes of prose above the board, so the position — which is the
 * thing every one of those sentences is *about* — was a scroll away from the sentence
 * describing it. "White Knight covers g6 and g8" is a claim you check by looking, and
 * you could not look and read at once. So the board is pinned beside the text on a wide
 * screen and stays there while the answers scroll past it.
 *
 * The answers are drawn from `ESSENTIALS_SECTIONS` for the reason they always were — a
 * question cannot be asked by the form and missing from the page — but the table now
 * carries how each one looks, so *what breaks it* and *what it survives* stop being two
 * identical grey boxes. They are the two halves of one question and they say opposite
 * things; on the page where that distinction is the whole lesson, it should not depend
 * on reading the heading.
 */
export default function PatternStudy({
  pattern,
  onTakeApart,
}: {
  pattern: PatternRecord
  onTakeApart: () => void
}) {
  const examples = pattern.examples
  const [shown, setShown] = useState(0)
  const example: PatternLine | undefined = examples[Math.min(shown, examples.length - 1)]

  return (
    <div className="grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-6 items-start">
      {/*
        Pinned, and only once there is a second column for it to be pinned beside. The
        scroll container is PageShell's, so `top` is measured from the header.
      */}
      <div className="w-full max-w-[26rem] mx-auto lg:mx-0 lg:sticky lg:top-2">
        {example ? (
          <ExampleBoard
            key={shown}
            line={example}
            examples={examples}
            shown={shown}
            onShow={setShown}
          />
        ) : (
          <div className="aspect-square rounded-xl border border-dashed border-zinc-800 flex items-center justify-center p-6">
            <p className="text-sm text-zinc-600 text-center">
              No example yet. Edit to paste a position or a game, and it will sit here
              beside the answers.
            </p>
          </div>
        )}
      </div>

      <div className="min-w-0 flex flex-col gap-3">
        {hasMethod(pattern) && pattern.essentials ? (
          ESSENTIALS_SECTIONS.map(section => {
            const points = pattern.essentials![section.key].filter(
              point => point.trim().length > 0,
            )
            // unanswered questions are left out rather than shown empty: this is the
            // read, and the form is where the prompts belong
            if (points.length === 0) return null
            const tone = TONE[section.tone]

            return (
              <section
                key={section.key}
                className={`border rounded-xl p-5 flex flex-col gap-3 ${tone.box}`}
              >
                <h3 className="flex items-center gap-2.5">
                  <span
                    className={`shrink-0 text-[11px] font-mono rounded-md px-1.5 py-0.5 ${tone.marker}`}
                  >
                    {section.number}
                  </span>
                  <span className={`text-sm font-medium ${tone.title}`}>{section.short}</span>
                  <span className="text-xs text-zinc-600 truncate hidden sm:block">
                    {section.title.toLowerCase()}
                  </span>
                </h3>

                <ol className="flex flex-col gap-2.5">
                  {points.map((point, index) => (
                    <li key={index} className="flex gap-2.5">
                      <span className="text-[11px] font-mono text-zinc-500 shrink-0 pt-1 w-5 text-right">
                        {roman(index + 1)}
                      </span>
                      <span className="min-w-0 text-[15px] leading-relaxed text-zinc-200">
                        {pointText(point)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )
          })
        ) : pattern.conditions.length > 0 ? (
          <section className="border border-zinc-800 bg-zinc-900/60 rounded-xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-medium text-zinc-200">When it applies</h3>
            <ul className="flex flex-col gap-2.5">
              {pattern.conditions.map((condition, index) => (
                <li key={index} className="flex gap-2.5">
                  <span className="text-zinc-700 shrink-0 pt-0.5">•</span>
                  <span className="min-w-0 text-[15px] leading-relaxed text-zinc-200">
                    {condition}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/*
          The offer, and the only thing on this page that asks for anything.

          A write-up with a line of conditions leaves most of this column empty, and an
          empty column beside a board is the page saying there is nothing more to know —
          when what is true is that nobody has written it down yet. It names what the
          method would add rather than saying "incomplete", because the four questions are
          the work and the point is to make starting them one press away.
        */}
        {!hasMethod(pattern) && (
          <button
            type="button"
            onClick={onTakeApart}
            className="text-left border border-dashed border-zinc-800 hover:border-zinc-700 rounded-xl p-5 flex flex-col gap-1.5 transition-colors group"
          >
            <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
              Take this one apart →
            </span>
            <span className="text-xs text-zinc-600 leading-relaxed">
              What each piece is responsible for, what weakness lets it happen, what would
              break it and what it survives. Knowing the edges is what turns a position you
              recognise into one you can find.
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The board, whichever example is showing, and what is written on its moves.
 *
 * The cursor lives out here rather than inside the board for the reason it always has:
 * whatever shows what is written on a move has to know which move is on the board. The
 * example switcher is chips rather than a dropdown — there are two or three of these,
 * and a dropdown hides how many there are behind a press.
 */
function ExampleBoard({
  line,
  examples,
  shown,
  onShow,
}: {
  line: PatternLine
  examples: PatternLine[]
  shown: number
  onShow: (index: number) => void
}) {
  const tree = useMemo(() => lineTree(line), [line])
  const home = useMemo(() => lineHome(tree, line.startPly), [tree, line.startPly])
  const [moved, setMoved] = useState<Path | null>(null)
  const path = moved ?? home

  const notes = useMemo(() => commentedNodes(tree), [tree])
  const standing = path.join('/')

  return (
    <div className="flex flex-col gap-3">
      {examples.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {examples.map((entry, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onShow(index)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                index === shown
                  ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {entry.title.trim() || `Example ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      {examples.length === 1 && line.title.trim().length > 0 && (
        <h3 className="text-sm font-medium text-zinc-300">{line.title}</h3>
      )}

      <MoveTreeBoard
        tree={tree}
        path={path}
        onPath={setMoved}
        orientation={lineOrientation(line)}
        home={home}
      />

      {line.note.trim().length > 0 && (
        <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">{line.note}</p>
      )}

      {notes.length > 0 && (
        <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
          {notes.map(note => (
            <button
              key={note.path.join('/')}
              type="button"
              onClick={() => setMoved(note.path)}
              className={`text-left px-3 py-2 flex flex-col gap-0.5 transition-colors ${
                standing === note.path.join('/') ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/40'
              }`}
            >
              <span className="text-[11px] font-mono text-zinc-500">
                {moveLabel(tree.startFen, note.path.length - 1, note.san, true)}
              </span>
              <span className="text-sm text-zinc-200 whitespace-pre-wrap">{note.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
