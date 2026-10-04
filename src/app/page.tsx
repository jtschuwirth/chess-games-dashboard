'use client'

import { useAuth } from '@/context/AuthContext'
import { signOut } from '@/lib/auth'
import SignInButton from '@/components/SignInButton'
import ConfigNotice from '@/components/ConfigNotice'
import { isFirebaseConfigured } from '@/lib/firebase'
import { Spinner } from '@/components/PageShell'
import HomeNav from '@/components/HomeNav'
import { VERSION } from '@/lib/version'

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
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-8 px-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Chess Games Dashboard</h1>
          <p className="text-zinc-400 text-lg">Sign in to get started</p>
        </div>
        <SignInButton />
        {/* before signing in too, so a deploy can be checked without an account */}
        <p className="text-xs text-zinc-700 font-mono">{VERSION}</p>
      </main>
    )
  }

  return (
    <HomeNav name={user.displayName ?? user.email ?? 'Signed in'} onSignOut={() => signOut()} />
  )
}
