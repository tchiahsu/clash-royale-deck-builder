import type { Card } from '../types'

// Public static dataset — no API key, no IP whitelist. CORS-enabled (GitHub Pages).
const CARDS_URL = 'https://royaleapi.github.io/cr-api-data/json/cards.json'

export const cardImageUrl = (key: string) =>
  `https://royaleapi.github.io/cr-api-assets/cards/${key}.png`

export const arenaLabel = (n: number) => (n === 0 ? 'Training Camp' : `Arena ${n}`)

interface RawCard {
  key: string
  name: string
  elixir: number | null
  type: string
  rarity: string
  arena: number
  description: string
  id: number
  is_evolved?: boolean
}

export async function loadCards(): Promise<Card[]> {
  const res = await fetch(CARDS_URL)
  if (!res.ok) throw new Error(`Failed to load card data (HTTP ${res.status})`)
  const raw = (await res.json()) as RawCard[]
  return raw
    .filter((c) => !c.is_evolved && typeof c.elixir === 'number')
    .map((c) => ({
      key: c.key,
      name: c.name,
      elixir: c.elixir as number,
      type: c.type,
      rarity: c.rarity,
      arena: c.arena,
      description: c.description,
      id: c.id,
    }))
    .sort((a, b) => a.elixir - b.elixir || a.name.localeCompare(b.name))
}
