import type { ProviderResponse, Source, TimeClass } from '@/types/chess'

const ENDPOINT: Record<Source, string> = {
  chesscom: '/api/chesscom/games',
  lichess: '/api/lichess/games',
}

export async function fetchProviderGames(
  source: Source,
  username: string,
  max: number,
  timeClasses: TimeClass[],
): Promise<ProviderResponse> {
  const params = new URLSearchParams({
    username,
    max: String(max),
    timeClasses: timeClasses.join(','),
  })

  const response = await fetch(`${ENDPOINT[source]}?${params}`)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body?.error ?? `Sync failed (${response.status}).`)
  }

  return body as ProviderResponse
}
