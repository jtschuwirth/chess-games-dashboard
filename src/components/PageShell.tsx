'use client'

import Link from 'next/link'
import type { User } from 'firebase/auth'
import { useAuth } from '@/context/AuthContext'
import { signOut } from '@/lib/auth'
import { isFirebaseConfigured } from '@/lib/firebase'
import ConfigNotice from '@/components/ConfigNotice'

export function Spinner({ size = 'w-8 h-8' }: { size?: string }) {
  return <div className={`${size} border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin`} />
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
export default function PageShell({
  title,
  wide = false,
  children,
}: {
  title: string
  wide?: boolean
  children: (user: User) => React.ReactNode
}) {
  const { user, loading } = useAuth()

  if (!isFirebaseConfigured) return <ConfigNotice />

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <Spinner />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
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
