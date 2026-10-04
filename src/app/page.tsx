'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { signOut } from '@/lib/auth'
import SignInButton from '@/components/SignInButton'
import ConfigNotice from '@/components/ConfigNotice'
import { isFirebaseConfigured } from '@/lib/firebase'
import { Spinner } from '@/components/PageShell'

const NAV_ITEMS = [
  {
    icon: '🔗',
    title: 'Profile & Sync',
    description: 'Link your chess.com and lichess accounts, pull in games',
    href: '/profile',
  },
  {
    icon: '📖',
    title: 'Openings',
    description: 'Save the lines you play and name them',
    href: '/openings',
  },
  {
    icon: '🧩',
    title: 'Patterns',
    description: 'Write up the ideas you keep missing, and tag mistakes with them',
    href: '/patterns',
  },
  {
    icon: '📊',
    title: 'Dashboard',
    description: 'Win / draw / loss splits, overall or per saved line',
    href: '/dashboard',
  },
  {
    icon: '🎯',
    title: 'Learn from your mistakes',
    description: 'Find the move again in the positions you got wrong',
    href: '/learn',
  },
]

export default function Home() {
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
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-100 gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Chess Games Dashboard</h1>
          <p className="text-zinc-400 text-lg">Sign in to get started</p>
        </div>
        <SignInButton />
      </div>
    )
  }

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-md px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Chess Games Dashboard</h1>
            <p className="text-zinc-400 text-sm mt-1">{user.displayName ?? user.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Sign out
          </button>
        </div>

        <nav className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-4 px-5 py-4">
                <span className="text-3xl w-10 text-center shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-base">{item.title}</span>
                  <p className="text-sm text-zinc-400 mt-0.5">{item.description}</p>
                </div>
                <span className="text-zinc-600 shrink-0">›</span>
              </div>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
