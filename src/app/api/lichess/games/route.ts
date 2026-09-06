import { NextResponse } from 'next/server'
import { fetchLichessGames } from '@/lib/providers/lichess'
import { ProviderError, parseSyncParams } from '@/lib/providers/shared'

export async function GET(request: Request) {
  try {
    const { username, max, timeClasses } = parseSyncParams(request.url)
    const { games, warnings } = await fetchLichessGames(username, max, timeClasses)
    return NextResponse.json({ games, warnings })
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('lichess sync failed', error)
    return NextResponse.json({ error: 'Unexpected error talking to Lichess.' }, { status: 502 })
  }
}
