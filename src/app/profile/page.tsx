'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageShell, { Spinner } from '@/components/PageShell'
import SyncPanel from '@/components/SyncPanel'
import { getProfile, saveProfile } from '@/lib/firestore'
import type { UserProfile } from '@/types/chess'

function ProfileBody({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [chesscom, setChesscom] = useState('')
  const [lichess, setLichess] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addedCount, setAddedCount] = useState<number | null>(null)

  useEffect(() => {
    getProfile(userId).then(loaded => {
      setProfile(loaded)
      setChesscom(loaded.chesscomUsername ?? '')
      setLichess(loaded.lichessUsername ?? '')
    })
  }, [userId])

  async function handleSaveUsernames() {
    setSaving(true)
    setSaved(false)
    const next: UserProfile = {
      chesscomUsername: chesscom.trim() || null,
      lichessUsername: lichess.trim() || null,
      lastSyncAt: profile?.lastSyncAt ?? null,
    }
    await saveProfile(userId, {
      chesscomUsername: next.chesscomUsername,
      lichessUsername: next.lichessUsername,
    })
    setProfile(next)
    setSaving(false)
    setSaved(true)
  }

  if (!profile) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner size="w-6 h-6" />
      </div>
    )
  }

  return (
    <>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Linked accounts</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Public profiles only — no password or OAuth needed on either site.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Chess.com username</span>
          <input
            value={chesscom}
            onChange={event => {
              setChesscom(event.target.value)
              setSaved(false)
            }}
            placeholder="magnuscarlsen"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Lichess username</span>
          <input
            value={lichess}
            onChange={event => {
              setLichess(event.target.value)
              setSaved(false)
            }}
            placeholder="DrNykterstein"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveUsernames}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save usernames'}
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
          {profile.lastSyncAt && (
            <span className="text-xs text-zinc-500 ml-auto">
              Last sync {new Date(profile.lastSyncAt).toLocaleString()}
            </span>
          )}
        </div>
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-2">
        <h2 className="font-semibold">Data export</h2>
        <p className="text-sm text-zinc-500">
          <code className="text-zinc-400">GET /api/export</code> returns your games, saved lines and
          their results as JSON. It needs <code className="text-zinc-400">EXPORT_API_KEY</code> and
          an admin credential in <code className="text-zinc-400">.env.local</code> — see the README.
        </p>
        <p className="text-xs text-zinc-600">
          Your user id: <code className="text-zinc-400 break-all">{userId}</code>
        </p>
      </section>

      <SyncPanel
        userId={userId}
        profile={profile}
        onSynced={added => setAddedCount(added.length)}
      />

      {addedCount !== null && (
        <p className="text-sm text-zinc-400">
          Head to the{' '}
          <Link href="/dashboard" className="underline text-zinc-200">
            dashboard
          </Link>{' '}
          to see the numbers.
        </p>
      )}
    </>
  )
}

export default function ProfilePage() {
  return <PageShell title="Profile & Sync">{user => <ProfileBody userId={user.uid} />}</PageShell>
}
