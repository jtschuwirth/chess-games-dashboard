'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_SECTIONS, sectionOf } from '@/lib/nav'
import { VERSION } from '@/lib/version'

/**
 * Every section, one press away, from wherever you are.
 *
 * The header had `← Home` and nothing else, so getting from a plan to the mistakes
 * dashboard was two navigations through a page whose only job was to list the others.
 * That page still exists and still reads well as a landing; it is a poor way to *move*,
 * which is what a menu is for.
 *
 * It is the one list — `NAV_SECTIONS`, the same table the home page's cards and the back
 * links are drawn from — so a tenth section arrives in all three at once.
 *
 * A panel rather than a dropdown because it has to work on a phone, where the header is
 * the only chrome there is; and it closes on a press, on Escape and on the backdrop,
 * which are the three ways anyone tries.
 */
export default function NavMenu({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const here = sectionOf(pathname ?? '')

  /* Escape closes it, which is the one way out that is not on the screen. */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the menu"
        aria-expanded={open}
        className="shrink-0 p-1.5 -ml-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
      >
        {/*
          Drawn rather than set as ☰, the board's own lesson about glyphs: a character
          renders differently per font and can render as nothing at all, and an empty box
          on the one control that opens the navigation is the worst place for it.
        */}
        <svg viewBox="0 0 20 20" className="w-5 h-5" aria-hidden="true">
          {[5, 10, 15].map(y => (
            <rect key={y} x="2" y={y - 1} width="16" height="2" rx="1" fill="currentColor" />
          ))}
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-zinc-950/70 backdrop-blur-[1px]"
          />

          <nav className="relative w-72 max-w-[85vw] h-full bg-zinc-900 border-r border-zinc-800 flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex-1 text-sm font-semibold text-zinc-100 hover:text-white transition-colors"
              >
                Chess Games Dashboard
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the menu"
                className="shrink-0 px-1.5 text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {NAV_SECTIONS.map(section => {
                const current = here?.href === section.href
                return (
                  <Link
                    key={section.href}
                    href={section.href}
                    onClick={() => setOpen(false)}
                    aria-current={current ? 'page' : undefined}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      current
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
                    }`}
                  >
                    <span className="text-base leading-none shrink-0">{section.icon}</span>
                    <span className="min-w-0 truncate">{section.title}</span>
                  </Link>
                )
              })}
            </div>

            <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-700 font-mono truncate">{VERSION}</span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onSignOut()
                }}
                className="shrink-0 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
