'use client'

import Link from 'next/link'
import type { User } from 'firebase/auth'
import { useAuth } from '@/context/AuthContext'
import { signOut } from '@/lib/auth'
import { isFirebaseConfigured } from '@/lib/firebase'
import ConfigNotice from '@/components/ConfigNotice'

/**
 * A span, not a div, because half its uses sit inside a sentence — "elapsed", "reading
 * the position" — and a div inside a `<p>` is invalid HTML that React reports as a
 * hydration error. `inline-block` keeps the circle a circle; as a flex item it is
 * blockified anyway, which is every other use.
 */
export function Spinner({ size = 'w-8 h-8' }: { size?: string }) {
  return (
    <span
      className={`${size} inline-block border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin`}
    />
  )
}

/** Turns whatever was thrown into something a person can read. */
export function errorText(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

/**
 * A load that failed, rather than a spinner that never stops. Firestore reads can fail
 * for reasons that have nothing to do with the code — the daily quota, a dropped
 * connection, rules — and an uncaught one leaves the page spinning forever while the
 * only trace is an unhandled rejection in the console.
 */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-16 flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-100 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}

/**
 * Handles the auth loading / signed-out states once, then hands the signed-in
 * user to the page body.
 */
/** What the app answers to in a tab, after the section that leads. */
const APP = 'Chess'

/**
 * The tab says which section you are in, and says it first.
 *
 * Every page was titled `Chess Games Dashboard`, so eight open tabs were eight identical
 * labels and the only way to find the one with the plan in it was to open them. A browser
 * gives a tab about a dozen characters before it truncates, which means the words that
 * tell one from another have to be the first ones — the section leads and the app's own
 * name trails, where losing it to the ellipsis costs nothing at all.
 *
 * A rendered `<title>` rather than Next's `metadata`, because every page here is a
 * client component behind an auth guard and a client component cannot export metadata.
 * React 19 hoists a `<title>` into the head from wherever it is rendered, which is what
 * makes this possible at all.
 *
 * It was `document.title` in an effect first, and that loses a race you cannot see:
 * **Next streams the metadata at the end of the document**, so the title element arrives
 * *after* hydration has already run the effect, and the page settles back to the layout's
 * default. Nothing overwrites it afterwards, which is what made it look like the effect
 * had never run. Rendering the element puts React in charge of it and there is no race
 * to lose — and the root layout now sets no title of its own, so there is exactly one.
 */
function TabTitle({ tab }: { tab: string }) {
  return <title>{`${tab} · ${APP}`}</title>
}

export default function PageShell({
  title,
  tab,
  wide = false,
  children,
}: {
  title: string
  /**
   * What the tab calls this, when the heading is too long or too alike for one.
   *
   * The heading has the width of a page and the tab has a dozen characters, so they are
   * not always the same words: `Learn from your mistakes` is a good heading and truncates
   * to nothing useful, and `Exercise guides` and `Exercise guide` are indistinguishable
   * at that width. Defaults to the heading, which is right for most of them.
   */
  tab?: string
  wide?: boolean
  children: (user: User) => React.ReactNode
}) {
  const { user, loading } = useAuth()

  /* on every branch, including the spinner: a tab you are waiting on is one you want named */
  const named = <TabTitle tab={tab ?? title} />

  if (!isFirebaseConfigured) return <ConfigNotice />

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        {named}
        <Spinner />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
        {named}
        <p>
          Please{' '}
          <Link href="/" className="underline text-zinc-200">
            sign in
          </Link>{' '}
          to continue.
        </p>
      </div>
    )
  }

  return (
    <main className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {named}
      <header className="px-6 py-4 border-b border-zinc-800 flex items-center gap-4 shrink-0">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm">
          ← Home
        </Link>
        <h1 className="text-xl font-semibold flex-1">{title}</h1>
        <button
          onClick={() => signOut()}
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Sign out
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className={`${wide ? 'max-w-5xl' : 'max-w-3xl'} mx-auto px-4 py-6 flex flex-col gap-6`}>
          {children(user)}
        </div>
      </div>
    </main>
  )
}
