'use client'

import { useState } from 'react'
import Link from 'next/link'
import Chip from '@/components/Chip'
import { Spinner } from '@/components/PageShell'
import { saveGames } from '@/lib/firestore'
import { parseUploads, type UploadSide } from '@/lib/upload'
import type { GameRecord, UserProfile } from '@/types/chess'

const SIDES: { value: UploadSide; label: string }[] = [
  { value: 'detect', label: 'Work it out' },
  { value: 'white', label: 'I am White' },
  { value: 'black', label: 'I am Black' },
]

/**
 * Bringing in a game that no sync will ever find: one you played over the board, a
 * friend's, one from a book. It becomes an ordinary game document with `source: upload`,
 * so the board, the engine, the review, the drill and the patterns all work on it — and
 * `matchesCriteria` keeps it out of your splits, because it is not your record.
 *
 * Which side is you has to be asked. For your own game the usernames settle it, but the
 * reason to paste a master game is to study it as one colour, and nothing in the file
 * says which.
 */
export default function UploadPanel({
  userId,
  profile,
  onUploaded,
}: {
  userId: string
  profile: UserProfile
  onUploaded: (added: GameRecord[]) => void
}) {
  const [pgn, setPgn] = useState('')
  const [side, setSide] = useState<UploadSide>('detect')
  const [running, setRunning] = useState(false)
  const [notes, setNotes] = useState<string[]>([])
  const [added, setAdded] = useState<GameRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  async function upload() {
    setRunning(true)
    setError(null)
    setNotes([])
    setAdded([])

    try {
      const { games, warnings } = parseUploads(pgn, {
        side,
        usernames: [profile.chesscomUsername ?? '', profile.lichessUsername ?? ''],
      })

      if (games.length === 0) {
        setNotes(warnings)
        return
      }

      const result = await saveGames(userId, games)
      setAdded(result.added)
      setNotes([
        `${result.added.length} added${
          result.updated > 0 ? `, ${result.updated} already stored and refreshed` : ''
        }.`,
        ...warnings,
      ])
      onUploaded(result.added)
      setPgn('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that PGN.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-5">
      <div>
        <h2 className="font-semibold">Upload a game</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          A game from over the board, a friend&apos;s, or one out of a book. It gets the board,
          the engine and the review like any other — but stays out of your win/draw/loss splits,
          since it is not your own record. Paste one game or a file of them.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Which side are you</span>
        <div className="flex gap-2 flex-wrap">
          {SIDES.map(option => (
            <Chip
              key={option.value}
              active={side === option.value}
              onClick={() => setSide(option.value)}
              title={
                option.value === 'detect'
                  ? 'Matches the names in the PGN against your linked usernames, and falls back to White'
                  : undefined
              }
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">PGN</span>
        <textarea
          value={pgn}
          onChange={event => setPgn(event.target.value)}
          rows={6}
          placeholder={'[Event "Club night"]\n[White "me"]\n[Black "someone"]\n\n1. e4 c6 2. d4 d5 …'}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 outline-none focus:border-zinc-600 placeholder:text-zinc-600 resize-y"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={upload}
          disabled={running || pgn.trim().length === 0}
          className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? 'Reading…' : 'Upload'}
        </button>
        {running && <Spinner size="w-4 h-4" />}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {notes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {notes.map((note, index) => (
            <li key={index} className="text-xs text-zinc-500">
              {note}
            </li>
          ))}
        </ul>
      )}

      {added.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-zinc-800 pt-3">
          {added.map(game => (
            <Link
              key={game.id}
              href={`/games/${game.id}?source=upload`}
              className="text-sm text-zinc-300 hover:text-white underline decoration-zinc-700 hover:decoration-zinc-400"
            >
              {game.color === 'white' ? 'White' : 'Black'} vs {game.opponent}
              <span className="text-zinc-600"> · {game.moves.length} half-moves</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
