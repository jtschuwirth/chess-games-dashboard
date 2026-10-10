'use client'

import type { StudyIdea } from '@/types/chess'

/**
 * One bullet of a study.
 *
 * It reads as prose and writes as a textarea, switched by the page rather than by the
 * row: a study is something you open before a game to read, so a page made of input
 * boxes would be a page you have to decode. The controls that act on the bullet appear
 * only while editing, which keeps the read view to the thing you came for.
 */
export default function StudyIdeaRow({
  idea,
  editing,
  placeholder,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
  children,
}: {
  idea: StudyIdea
  editing: boolean
  placeholder: string
  onChange: (next: StudyIdea) => void
  onRemove: () => void
  onMove: (delta: number) => void
  canMoveUp: boolean
  canMoveDown: boolean
  /** What the bullet points at — patterns, games. Shown under it in both modes. */
  children?: React.ReactNode
}) {
  if (!editing) {
    // a bullet with nothing written in it is not worth a line of its own when reading
    if (idea.text.trim().length === 0) return null

    return (
      <li className="flex gap-2.5">
        <span className="text-zinc-700 select-none leading-relaxed">•</span>
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{idea.text}</p>
          {children}
        </div>
      </li>
    )
  }

  return (
    <li className="flex gap-2 items-start">
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <textarea
          value={idea.text}
          onChange={event => onChange({ ...idea, text: event.target.value })}
          placeholder={placeholder}
          rows={2}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600 resize-y"
        />
        {children}
      </div>

      <div className="flex flex-col items-center shrink-0 pt-1">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={!canMoveUp}
          title="Move up"
          aria-label="Move up"
          className="w-5 h-4 text-xs text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:hover:text-zinc-600 transition-colors"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={!canMoveDown}
          title="Move down"
          aria-label="Move down"
          className="w-5 h-4 text-xs text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:hover:text-zinc-600 transition-colors"
        >
          ▼
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Remove this"
          aria-label="Remove this"
          className="w-5 h-5 text-sm text-zinc-700 hover:text-red-400 transition-colors"
        >
          ×
        </button>
      </div>
    </li>
  )
}
