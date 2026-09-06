import { NextResponse } from 'next/server'
import { fetchChessComGames } from '@/lib/providers/chesscom'
import { ProviderError, parseSyncParams } from '@/lib/providers/shared'

export async function GET(request: Request) {
  try {
    const { username, max, timeClasses } = parseSyncParams(request.url)
    const { games, warnings } = await fetchChessComGames(username, max, timeClasses)
    return NextResponse.json({ games, warnings })
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('chess.com sync failed', error)
    return NextResponse.json({ error: 'Unexpected error talking to Chess.com.' }, { status: 502 })
  }
}
