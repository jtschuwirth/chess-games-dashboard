'use client'

import ProposedMoves, { type ProposedRow, type Verdict } from '@/components/ProposedMoves'
import TagPicker from '@/components/TagPicker'
import { ENGINE_DEPTH } from '@/lib/analysis'
import { plyLabel } from '@/lib/board'
import { formatEval } from '@/lib/review'
import { tagName, type TagGroup } from '@/lib/tags'
import type { Color } from '@/types/chess'

/** A note being written. The editor's working shape, parsed into a `MoveNote` on save. */
export interface NoteDraft {
  ply: number
  san: string
  moveNumber: number
  note: string
  tags: string[]
  lines: ProposedRow[]
  cpBefore: number | null
  cpAfter: number | null
}

const FIELD =
  'bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600'

/**
 * One move worth remembering, written up without the root-cause questions.
 *
 * It is the same card as a mistake minus the three questions that presume something
 * went wrong — so it keeps the parts that are about the move rather than about the
 * fault: what you want to say, what to file it under, and the lines you were weighing.
 * Bordered in sky rather than left plain, because the two kinds of entry sit in one
 * form and which one you are reading should not need working out.
 */
export default function MoveNoteCard({
  draft,
  yours,
  color,
  fenBefore,
  folded,
  onToggleFold,
  tagsOpen,
  onToggleTags,
  onChange,
  onRemove,
  onShowPly,
  verdicts,
  patternTags,
  tagGroups,
  asking,
  onAsk,
  engineAnswer,
  boardLine,
  live,
}: {
  draft: NoteDraft
  /** Whether this is your move. Theirs reads differently and is judged differently. */
  yours: boolean
  color: Color
  fenBefore: string | null
  folded: boolean
  onToggleFold: () => void
  tagsOpen: boolean
  onToggleTags: () => void
  onChange: (changes: Partial<NoteDraft>) => void
  onRemove: () => void
  onShowPly: () => void
  verdicts: Record<string, Verdict>
  patternTags: string[]
  tagGroups: TagGroup[]
  asking: boolean
  onAsk: () => void
  engineAnswer?: string
  /** The line played out on the game's board from this move, if it is on one. */
  boardLine?: string[]
  /** The engine's reading of the move you played, once it has one. */
  live: { cpBefore: number; cpAfter: number } | null
}) {
  const shownBefore = live ? live.cpBefore : draft.cpBefore
  const shownAfter = live ? live.cpAfter : draft.cpAfter

  return (
    <div className="border border-sky-500/25 rounded-lg p-4 flex flex-col gap-3 bg-sky-500/[0.03]">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onToggleFold}
          title={folded ? 'Open this note' : 'Fold this note away'}
          aria-label={folded ? 'Open this note' : 'Fold this note away'}
          aria-expanded={!folded}
          className="w-5 h-5 shrink-0 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 transition-colors leading-none"
        >
          {folded ? '+' : '−'}
        </button>

        <button
          type="button"
          onClick={onShowPly}
          className="font-mono text-sm text-zinc-100 hover:text-white underline decoration-zinc-700 hover:decoration-zinc-400 transition-colors"
          title="Show this position on the board"
        >
          {plyLabel(draft.ply, draft.san)}
        </button>

        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/15 text-sky-300">
          {yours ? 'note' : 'their move'}
        </span>

        {shownBefore !== null && (
          <span
            className="text-xs text-zinc-500 font-mono"
            title={
              live
                ? `Depth ${ENGINE_DEPTH}, from White's side — the same depth as everything below`
                : "From White's side, the way a board shows it"
            }
          >
            {formatEval(shownBefore, color)} → {formatEval(shownAfter, color)}
          </span>
        )}

        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-xs text-zinc-500 hover:text-red-400 transition-colors"
        >
          Remove
        </button>
      </div>

      {folded ? (
        <p className="text-xs text-zinc-500 truncate">
          {draft.tags.length > 0
            ? draft.tags.map(id => tagName(id, tagGroups)).join(' · ')
            : draft.note.trim() || 'Nothing written yet.'}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-zinc-300">
                {yours ? 'What is worth saying?' : 'What did they do here?'}
              </span>
              <span className="text-xs text-zinc-600">
                the idea, the moment, the thing to remember
              </span>
            </div>
            <textarea
              value={draft.note}
              onChange={event => onChange({ note: event.target.value })}
              rows={3}
              placeholder={
                yours
                  ? 'The knight is going to f5 via e2 and there is nothing they can do about it.'
                  : 'They gave up the outpost to win a pawn — this is the move I should have been hoping for.'
              }
              className={`${FIELD} resize-y`}
            />
          </div>

          <ProposedMoves
            label={yours ? 'What else was I choosing between?' : 'What else could they have played?'}
            hint={
              yours
                ? 'optional — the move you did not play, and why'
                : 'optional — what you were expecting instead'
            }
            ply={draft.ply}
            rows={draft.lines}
            fenBefore={fenBefore}
            color={color}
            verdicts={verdicts}
            onChange={lines => onChange({ lines })}
            linePlaceholder="Nd5 Bxe7 Qxe7"
            whyPlaceholder="Wins the bishop pair but gives up the outpost — I went the other way."
            addLabel="+ another move"
            asking={asking}
            onAsk={onAsk}
            engineAnswer={engineAnswer}
            boardLine={boardLine}
          />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-zinc-300">Tags</span>
            <TagPicker
              tags={draft.tags}
              open={tagsOpen}
              onToggleOpen={onToggleTags}
              onChange={tags => onChange({ tags })}
              patternTags={patternTags}
              groups={tagGroups}
            />
          </div>
        </>
      )}
    </div>
  )
}
