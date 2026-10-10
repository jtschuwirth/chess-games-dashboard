'use client'

import StudyIdeaRow from '@/components/StudyIdeaRow'
import type { StudyIdea } from '@/types/chess'

/**
 * One list of bullets — a whole section, or one side's main plans.
 *
 * The empty state is the section's own hint rather than "nothing here yet", because a
 * study you have not written is a prompt and not a gap: the page should say what belongs
 * in it. While editing it says nothing at all, since the placeholder in the first box is
 * already saying it.
 */
export default function StudyIdeaList({
  ideas,
  editing,
  hint,
  placeholder,
  addLabel,
  onChange,
  onRemove,
  onMove,
  onAdd,
  renderLinks,
}: {
  /** Already narrowed to this list — the page owns the flat array. */
  ideas: StudyIdea[]
  editing: boolean
  hint: string
  placeholder: string
  addLabel: string
  onChange: (id: string, next: StudyIdea) => void
  onRemove: (id: string) => void
  onMove: (id: string, delta: number) => void
  onAdd: () => void
  /** What each bullet points at. Supplied by the page, which holds the patterns and games. */
  renderLinks?: (idea: StudyIdea) => React.ReactNode
}) {
  const written = ideas.filter(idea => idea.text.trim().length > 0)

  if (!editing && written.length === 0) {
    return <p className="text-sm text-zinc-600">{hint}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {ideas.map((idea, index) => (
          <StudyIdeaRow
            key={idea.id}
            idea={idea}
            editing={editing}
            placeholder={placeholder}
            onChange={next => onChange(idea.id, next)}
            onRemove={() => onRemove(idea.id)}
            onMove={delta => onMove(idea.id, delta)}
            canMoveUp={index > 0}
            canMoveDown={index < ideas.length - 1}
          >
            {renderLinks?.(idea)}
          </StudyIdeaRow>
        ))}
      </ul>

      {editing && (
        <button
          type="button"
          onClick={onAdd}
          className="self-start text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          {addLabel}
        </button>
      )}
    </div>
  )
}
