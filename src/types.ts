export interface Card {
  key: string
  name: string
  elixir: number
  type: string // Troop | Spell | Building
  rarity: string // Common | Rare | Epic | Legendary | Champion
  arena: number // arena where the card unlocks
  description: string
  id: number
}

export type SelectionState = 'include' | 'exclude'

export interface Deck {
  name: string
  archetype: string
  cards: string[] // card keys
  estimatedWinRate: number
  averageElixir?: number
  description: string
  winConditions?: string[]
  tank?: string
  offense: string
  defense: string
}

export interface RecommendResponse {
  decks: Deck[]
}
