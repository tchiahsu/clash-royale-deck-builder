// Pure deck-finalization logic, extracted from the request handler so it can be
// unit-tested without calling the model. Given the model's parsed decks and the
// player's pool/constraints, it produces exactly-8-card decks that honor
// must-include cards, never duplicate each other, and always carry a sensible
// (non-zero) estimated win rate.

export interface PoolCard {
  key: string
  name: string
  elixir: number
  type: string
  rarity: string
}

export interface ParsedDeck {
  name: string
  archetype: string
  cards: string[]
  estimatedWinRate: number
  description: string
  winConditions: string[]
  tank: string
  offense: string
  defense: string
}

export interface FinalDeck extends ParsedDeck {
  averageElixir: number
}

// The displayed win rate is the model's own estimate (not real ladder data), so
// we keep it inside a believable competitive band and never surface a 0%
// (failed-generation) deck.
export const MIN_WIN_RATE = 52
export const MAX_WIN_RATE = 72
export const clampWinRate = (n: number) => Math.min(MAX_WIN_RATE, Math.max(MIN_WIN_RATE, Math.round(n)))
// Fallback estimate when the model didn't return a usable number: derive it
// from how close the deck's average elixir is to a healthy ~3.6 curve.
export const heuristicWinRate = (avgElixir: number) => clampWinRate(60 - Math.abs(avgElixir - 3.6) * 4)

export interface FinalizeOpts {
  pool: PoolCard[]
  mode: 'battle' | 'war'
  include: string[]
  exclude: string[]
}

export function finalizeDecks(parsed: ParsedDeck[], opts: FinalizeOpts): FinalDeck[] {
  const { pool, mode, include, exclude } = opts
  const isWar = mode === 'war'
  const deckCount = isWar ? 4 : 3

  const byKey = new Map(pool.map((c) => [c.key, c]))
  const byName = new Map(pool.map((c) => [c.name.toLowerCase(), c.key]))
  const excludeSet = new Set(exclude)
  const normalizeKey = (raw: unknown): string | null => {
    const k = String(raw ?? '').trim()
    if (byKey.has(k)) return k
    return byName.get(k.toLowerCase()) ?? null
  }
  const avgOf = (ks: string[]) =>
    Math.round((ks.reduce((s, k) => s + (byKey.get(k)?.elixir ?? 0), 0) / (ks.length || 1)) * 10) / 10
  // War: a must-include card can live in only one deck, so spread includes
  // across the four decks. Battle: every deck includes them.
  const includesFor = (i: number) =>
    isWar ? include.filter((_, idx) => idx % deckCount === i) : include

  // War enforces global uniqueness (no card in two decks); both modes backfill
  // any gaps from unused, non-excluded pool cards.
  const usedGlobally = new Set<string>()
  // Signatures of decks already produced, so no two decks come out identical
  // (mainly a Battle concern, where decks may share cards).
  const seen = new Set<string>()
  const signature = (ks: string[]) => [...ks].sort().join(',')

  const decks = parsed.map((deck, i) => {
    const cards: string[] = []
    const take = (k: string) => {
      if (cards.length >= 8 || cards.includes(k) || excludeSet.has(k)) return
      if (isWar && usedGlobally.has(k)) return
      cards.push(k)
      if (isWar) usedGlobally.add(k)
    }
    // Honor the player's must-include cards FIRST so they always make the deck,
    // regardless of what the model returned.
    const mustInclude = includesFor(i)
      .map(normalizeKey)
      .filter((k): k is string => Boolean(k))
    const mustSet = new Set(mustInclude)
    for (const k of mustInclude) take(k)
    for (const k of deck.cards) take(k)
    for (const c of pool) take(c.key)

    // Diversify if this deck duplicates an earlier one: swap out non-required
    // cards for unused pool cards until its 8-card set is unique.
    if (cards.length === 8) {
      const spares = pool.filter(
        (c) => !excludeSet.has(c.key) && !cards.includes(c.key) && !(isWar && usedGlobally.has(c.key)),
      )
      let s = 0
      while (seen.has(signature(cards)) && s < spares.length) {
        let swapIdx = -1
        for (let j = cards.length - 1; j >= 0; j--) {
          if (!mustSet.has(cards[j])) {
            swapIdx = j
            break
          }
        }
        if (swapIdx === -1) break // every card is required; can't diversify
        const replaced = cards[swapIdx]
        const next = spares[s++]
        cards[swapIdx] = next.key
        if (isWar) {
          usedGlobally.delete(replaced)
          usedGlobally.add(next.key)
        }
      }
    }
    seen.add(signature(cards))

    const averageElixir = avgOf(cards)
    // Use the model's estimate when it gave a real one; otherwise fall back to a
    // curve-based heuristic. Either way it's clamped into a competitive band, so
    // a deck never displays as 0% or an implausible figure.
    const modelRate = deck.estimatedWinRate
    const estimatedWinRate =
      Number.isFinite(modelRate) && modelRate > 0
        ? clampWinRate(modelRate)
        : heuristicWinRate(averageElixir)
    return { ...deck, cards, averageElixir, estimatedWinRate }
  })

  // Strongest decks first — for War this surfaces the highest win rates at the
  // top of the four.
  decks.sort((a, b) => b.estimatedWinRate - a.estimatedWinRate)
  return decks
}
