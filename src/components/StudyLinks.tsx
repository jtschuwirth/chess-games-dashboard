'use client'

import { useState } from 'react'
import { linkHost } from '@/lib/study'
import type { StudyLink } from '@/types/chess'

/**
 * Where else this opening is written up.
 *
 * Link cards rather than embeds: a video and a lichess study are things you go and
 * watch, and an iframe of either would take over the page you came to read. The host is
 * on the card because that is what tells a video from a study from an article at a
 * glance, before the title has been read.
 */
export default function StudyLinks({
  links,
  editing,
  hint,
  onChange,
}: {
  links: StudyLink[]
  editing: boolean
  hint: string
  onChange: (next: StudyLink[]) => void
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  function add() {
    if (url.trim().length === 0) return
    onChange([...links, { url: url.trim(), title: title.trim() || linkHost(url.trim()) }])
    setUrl('')
    setTitle('')
  }

  if (!editing && links.length === 0) {
    return <p className="text-sm text-zinc-600">{hint}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {links.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2">
          {links.map((link, index) => (
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
                  title="Remove this reference"
                  aria-label="Remove this reference"
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
            placeholder="https://…"
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
