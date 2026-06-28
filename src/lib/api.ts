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

  // Read the body as text first so a non-JSON response gives a clear message
  // instead of "Unexpected end of JSON input".
  const raw = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  const looksLikeHtml = contentType.includes('text/html') || /^\s*</.test(raw)

  // The most common deploy failure: the request returns the SPA's index.html
  // instead of deck JSON, meaning the /api backend isn't running on this host.
  if (looksLikeHtml) {
    throw new Error(
      'The /api backend is not running on this deployment — the request returned the web page (HTML), not deck data. ' +
        'This app must be deployed as a Node web service that runs `npm start`, not as a static site.',
    )
  }

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
    throw new Error('The server returned an empty or invalid response. Please try again.')
  }
  return data
}
