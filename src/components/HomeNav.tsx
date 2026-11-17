'use client'

import Link from 'next/link'
import { NAV_SECTIONS } from '@/lib/nav'
import { VERSION } from '@/lib/version'

/**
 * Where you land once signed in: the things the app does, and which build this is.
 *
 * Drawn from `NAV_SECTIONS`, the same table the header's menu and the back links read,
 * so a new section arrives here, in the menu and in what Back says at once — rather than
 * being added to whichever of the three somebody remembered.
 *
 * Two columns from `sm` up rather than one long list, because six rows of a single
 * column pushed the last one under the fold on a laptop — and the page scrolls rather
 * than centring in a fixed viewport, which is what clipped it with no way back.
 */
export default function HomeNav({
  name,
  onSignOut,
}: {
  name: string
  onSignOut: () => void
}) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-10 sm:py-16">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-8">
        <header className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Chess Games Dashboard</h1>
            <p className="text-sm text-zinc-500 mt-1 truncate">
              {name}
            </p>
          </div>

          {/* a bordered control with its own space: inline it sat against the title */}
          <button
            onClick={() => onSignOut()}
            className="shrink-0 px-3 py-1.5 text-xs font-medium border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
          >
            Sign out
          </button>
        </header>

        <nav className="grid gap-2 sm:grid-cols-2">
          {NAV_SECTIONS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <span className="text-2xl leading-none shrink-0">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm text-zinc-100">{item.title}</span>
                <span className="block text-xs text-zinc-500 mt-1 leading-relaxed">
                  {item.description}
                </span>
              </span>
              <span className="text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0">
                ›
              </span>
            </Link>
          ))}
        </nav>

        <footer className="text-xs text-zinc-700 font-mono">{VERSION}</footer>
      </div>
    </main>
  )
}
