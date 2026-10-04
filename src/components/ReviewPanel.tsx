import Link from 'next/link'
import { FoldButton, useFolded } from '@/components/Section'
import { aggregateTags, reviewQueue, reviewSummary } from '@/lib/review'
import type { GameRecord } from '@/types/chess'

/** Enough to see the shape of it without turning the dashboard into a table of tags. */
const TOP_TAGS = 12

function Figure({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="flex flex-col" title={hint}>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  )
}

/**
 * The mistake database for whatever the filters select: which ideas keep costing you
 * games, and which games are still waiting to be taken apart.
 *
 * Only entries you did not mark as unreasonable are counted — the same rule the tag
 * filter uses — so clicking a row always lands on the games behind the number.
 */
export default function ReviewPanel({
  games,
  activeTag,
  onPickTag,
  hrefFor,
  drillHref,
  patternTags = [],
}: {
  games: GameRecord[]
  activeTag: string | null
  onPickTag: (tag: string | null) => void
  /** The game view for one game, with the current filters carried along. */
  hrefFor: (game: GameRecord) => string
  /** The drill over these same games, filters attached. */
  drillHref: string
  /** Your patterns' names, so a tag that is one reads as a Pattern rather than your own. */
  patternTags?: string[]
}) {
  const summary = reviewSummary(games)
  const tags = aggregateTags(games, new Set(patternTags))
  const queue = reviewQueue(games)
  const [folded, toggle] = useFolded('mistakes')
  const shown = tags.slice(0, TOP_TAGS)
  const worst = shown[0]?.count ?? 1

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <FoldButton folded={folded} onToggle={toggle} label="the mistake database" />
            Mistake database
          </h2>
          {!folded && (
            <p className="text-xs text-zinc-500 mt-0.5">
              Your own reviews across the {games.length} filtered game
              {games.length === 1 ? '' : 's'}. The engine says where to look; this says why it
              happened.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {summary.reviewed > 0 && (
            <Link
              href={drillHref}
              className="px-3 py-1.5 text-xs font-medium border border-zinc-700 text-zinc-200 rounded-lg hover:border-zinc-500 transition-colors"
            >
              Drill these positions
            </Link>
          )}
          {queue.length > 0 && (
            <Link
              href={hrefFor(queue[0])}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors"
            >
              Review next game →
            </Link>
          )}
        </div>
      </div>

      {!folded && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure value={summary.reviewed} label="games reviewed" />
        <Figure
          value={summary.waiting}
          label="flagged, not reviewed"
          hint="Analysed games with a blunder or mistake and no review yet"
        />
        <Figure value={summary.mistakes} label="mistakes recorded" />
        <Figure
          value={summary.unreasonable}
          label="beyond reach"
          hint="Marked as not reasonably findable, so left out of the counts"
        />
      </div>

      {summary.untagged > 0 && (
        <p className="text-xs text-zinc-600">
          {summary.untagged} recorded mistake{summary.untagged === 1 ? '' : 's'} carry no tag, so
          they add nothing to the table below.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {queue.length > 0
            ? `${queue.length} analysed game${
                queue.length === 1 ? '' : 's'
              } here carry an engine mark and no review. Open one and name what went wrong — the tags accumulate into this table.`
            : 'No tagged mistakes in this slice yet. Open a game and take a move apart.'}
        </p>
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 px-2 pb-1.5 text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
            <span>Tag</span>
            <span className="text-right">Times</span>
            <span className="text-right">Games</span>
            <span className="text-right">Lost</span>
          </div>

          {shown.map(entry => (
            <button
              key={entry.tag}
              onClick={() => onPickTag(activeTag === entry.tag ? null : entry.tag)}
              title={
                activeTag === entry.tag
                  ? 'Clear the tag filter'
                  : `Show only games tagged "${entry.tag}"`
              }
              className={`grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 px-2 py-2 text-sm text-left border-b border-zinc-800/60 transition-colors ${
                activeTag === entry.tag ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
              }`}
            >
              <span className="min-w-0">
                <span className="text-zinc-100">{entry.tag}</span>
                <span className="text-xs text-zinc-600"> · {entry.group}</span>
                <span className="block mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <span
                    className="block h-full bg-sky-500/70 rounded-full"
                    style={{ width: `${(entry.count / worst) * 100}%` }}
                  />
                </span>
              </span>
              <span className="text-right tabular-nums text-zinc-200">{entry.count}</span>
              <span className="text-right tabular-nums text-zinc-400">{entry.games}</span>
              <span className="text-right tabular-nums text-zinc-400">{entry.losses}</span>
            </button>
          ))}

          {tags.length > shown.length && (
            <p className="text-xs text-zinc-600 px-2 pt-2">
              {tags.length - shown.length} more tag{tags.length - shown.length === 1 ? '' : 's'}{' '}
              recorded below this.
            </p>
          )}
        </div>
      )}
      </>
      )}
    </section>
  )
}
