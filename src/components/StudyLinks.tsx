'use client'

import { useState } from 'react'
import { lichessEmbed, linkHost } from '@/lib/study'
import type { StudyLink, StudyLinkSectionId } from '@/types/chess'

/**
 * One links section of a study — the line studies, or the references.
 *
 * **References are cards; line studies are boards.** A reference is a video or an
 * article: something you go away and read, which an iframe would only take over the page
 * to show you. A line study is the opposite — it is the moves themselves, and the whole
 * reason for pointing at it from here is to play through a variation without leaving the
 * page you are writing on. So that one is embedded, and `embed` is what says which kind
 * of section this is.
 *
 * Not every line study can be: lichess embeds a *chapter*, so a URL naming only the
 * study has nothing to render and falls back to a card. Both can be in one section at
 * once, which is why the boards and the cards are drawn as two lists rather than one.
 *
 * It is handed the study's *whole* list and told which section is its own, rather than a
 * ready-made subset. A subset handed back through `onChange` would be the new value of
 * the whole field, so every edit here would drop the other section's links.
 */
export default function StudyLinks({
  links,
  section,
  editing,
  hint,
  placeholder = 'https://…',
  embed = false,
  onChange,
}: {
  /** Every link in the study. This panel shows and edits the ones in `section`. */
  links: StudyLink[]
  section: StudyLinkSectionId
  editing: boolean
  hint: string
  /** What a URL here tends to look like. The section's own prompt, not a rule. */
  placeholder?: string
  /** Whether a link that can be put on a board should be, rather than listed. */
  embed?: boolean
  onChange: (next: StudyLink[]) => void
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  /** This section's links, each carrying where it sits in the stored array. */
  const mine = links
    .map((link, index) => ({ link, index }))
    .filter(entry => entry.link.section === section)

  /** The ones that can go on a board here, and the ones that stay a card. */
  const boards = embed
    ? mine.flatMap(entry => {
        const src = lichessEmbed(entry.link.url)
        return src ? [{ ...entry, src }] : []
      })
    : []
  const cards = mine.filter(entry => !boards.some(board => board.index === entry.index))

  function add() {
    if (url.trim().length === 0) return
    onChange([
      ...links,
      { url: url.trim(), title: title.trim() || linkHost(url.trim()), section },
    ])
    setUrl('')
    setTitle('')
  }

  if (!editing && mine.length === 0) {
    return <p className="text-sm text-zinc-600">{hint}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {boards.map(({ link, index, src }) => (
        <div key={`${link.url}-${index}`} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-200 hover:text-zinc-50 transition-colors truncate"
            >
              {link.title} <span className="text-[11px] text-zinc-600">lichess.org ↗</span>
            </a>

            {editing && (
              <button
                type="button"
                onClick={() => onChange(links.filter((_, at) => at !== index))}
                title="Remove this link"
                aria-label="Remove this link"
                className="ml-auto shrink-0 text-sm text-zinc-700 hover:text-red-400 transition-colors"
              >
                ×
              </button>
            )}
          </div>

          {/*
            Lazy, because a study can carry several of these and each one is a whole
            lichess board booting up. The height is fixed rather than an aspect ratio:
            the embed is a square board beside a column of text, so widening the panel
            only widens the text, and a 3:2 box on a desktop would be half a screen tall.
          */}
          <iframe
            src={src}
            title={link.title}
            loading="lazy"
            className="w-full h-[26rem] sm:h-[24rem] rounded-lg border border-zinc-800 bg-zinc-950"
          />
        </div>
      ))}

      {cards.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2">
          {cards.map(({ link, index }) => (
            <div key={`${link.url}-${index}`} className="flex items-start gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 flex flex-col gap-0.5 border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-950/60 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <span className="text-sm text-zinc-200 truncate">{link.title}</span>
                <span className="text-[11px] text-zinc-600 truncate">{linkHost(link.url)} ↗</span>
              </a>

              {editing && (
                <button
                  type="button"
                  onClick={() => onChange(links.filter((_, at) => at !== index))}
                  title="Remove this link"
                  aria-label="Remove this link"
                  className="shrink-0 mt-2 text-sm text-zinc-700 hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={url}
            onChange={event => setUrl(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') add()
            }}
            placeholder={placeholder}
            className="flex-1 min-w-[14rem] bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600"
          />
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') add()
            }}
            placeholder="What it is"
            className="flex-1 min-w-[10rem] bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={add}
            disabled={url.trim().length === 0}
            className="px-3 py-2 text-xs font-medium bg-zinc-800 text-zinc-100 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
