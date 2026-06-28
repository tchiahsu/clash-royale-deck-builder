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

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `Request failed (HTTP ${res.status})`)
  }
  return (await res.json()) as RecommendResponse
}
