import type { Card, RecommendResponse } from '../types'

export type Mode = 'battle' | 'war'

interface RecommendParams {
  arena: number
  include: string[]
  exclude: string[]
  pool: Card[]
  mode: Mode
}

export async function recommendDecks(params: RecommendParams): Promise<RecommendResponse> {
  const res = await fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      arena: params.arena,
      mode: params.mode,
      include: params.include,
      exclude: params.exclude,
      pool: params.pool.map((c) => ({
        key: c.key,
        name: c.name,
        elixir: c.elixir,
        type: c.type,
        rarity: c.rarity,
      })),
    }),
  })

  // Read the body as text first so an empty or non-JSON response (e.g. a
  // gateway timeout that returns headers but no body) gives a clear message
  // instead of "Unexpected end of JSON input".
  const raw = await res.text()
  let data: (RecommendResponse & { error?: string }) | null = null
  if (raw) {
    try {
      data = JSON.parse(raw) as RecommendResponse & { error?: string }
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (HTTP ${res.status})`)
  }
  if (!data || !Array.isArray(data.decks)) {
    throw new Error(
      'The server returned an empty or invalid response. The request may have timed out — please try again.',
    )
  }
  return data
}
