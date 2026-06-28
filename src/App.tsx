import { useEffect, useMemo, useState } from 'react'
import { loadCards, arenaLabel } from './lib/cards'
import { recommendDecks, type Mode } from './lib/api'
import type { Card, Deck, SelectionState } from './types'
import CardTile from './components/CardTile'
import DeckResults from './components/DeckResults'

type SortBy = 'elixir' | 'type' | 'rarity'
const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'elixir', label: 'Elixir' },
  { value: 'type', label: 'Type' },
  { value: 'rarity', label: 'Rarity' },
]
const TYPE_ORDER: Record<string, number> = { Troop: 0, Building: 1, Spell: 2 }
const RARITY_RANK: Record<string, number> = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Champion: 4 }

export default function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [mode, setMode] = useState<Mode>('battle')
  const [arena, setArena] = useState(11)
  const [selections, setSelections] = useState<Record<string, SelectionState>>({})

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('elixir')
  const [showLocked, setShowLocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const maxInclude = mode === 'war' ? 32 : 8

  useEffect(() => {
    loadCards()
      .then(setCards)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Failed to load cards'))
  }, [])

  const cardsByKey = useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards])

  const arenaOptions = useMemo(() => {
    const set = new Set(cards.map((c) => c.arena))
    return [...set].sort((a, b) => a - b)
  }, [cards])

  const includeKeys = useMemo(
    () => Object.keys(selections).filter((k) => selections[k] === 'include'),
    [selections],
  )
  const excludeKeys = useMemo(
    () => Object.keys(selections).filter((k) => selections[k] === 'exclude'),
    [selections],
  )

  // Cards unlocked at the selected arena make up the recommendation pool.
  const unlockedPool = useMemo(() => cards.filter((c) => c.arena <= arena), [cards, arena])

  const visibleCards = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = cards.filter((c) => {
      if (!showLocked && c.arena > arena) return false
      if (q && !c.name.toLowerCase().includes(q)) return false
      return true
    })
    const byElixir = (a: Card, b: Card) => a.elixir - b.elixir || a.name.localeCompare(b.name)
    return filtered.sort((a, b) => {
      if (sortBy === 'type') {
        return (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || byElixir(a, b)
      }
      if (sortBy === 'rarity') {
        return (RARITY_RANK[a.rarity] ?? 9) - (RARITY_RANK[b.rarity] ?? 9) || byElixir(a, b)
      }
      return byElixir(a, b)
    })
  }, [cards, search, sortBy, showLocked, arena])

  const cycleSelection = (key: string) => {
    setNotice(null)
    setSelections((prev) => {
      const current = prev[key]
      const next = { ...prev }
      if (!current) {
        const includeCount = Object.values(prev).filter((v) => v === 'include').length
        if (includeCount >= maxInclude) {
          setNotice(`You can include at most ${maxInclude} cards — marked as excluded instead.`)
          next[key] = 'exclude'
        } else {
          next[key] = 'include'
        }
      } else if (current === 'include') {
        next[key] = 'exclude'
      } else {
        delete next[key]
      }
      return next
    })
  }

  const clearSelections = () => {
    setSelections({})
    setNotice(null)
  }

  const generate = async () => {
    setGenerating(true)
    setGenError(null)
    setDecks(null)
    try {
      const res = await recommendDecks({
        arena,
        mode,
        include: includeKeys,
        exclude: excludeKeys,
        pool: unlockedPool,
      })
      setDecks(res.decks)
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate decks')
    } finally {
      setGenerating(false)
    }
  }

  if (loadError) {
    return (
      <div className="app">
        <div className="fatal">Could not load card data: {loadError}</div>
      </div>
    )
  }

  const hasSelection = includeKeys.length > 0 || excludeKeys.length > 0

  return (
    <div className="app">
      <header className="app-header">
        <h1>Clash Royale Deck Builder</h1>
        <p className="sub">
          Pick cards you want, cards you don't, and your arena — then let Gemini suggest your deck. One-time use; nothing is saved.
        </p>
      </header>

      <nav className="tabs" role="tablist" aria-label="Deck type">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'battle'}
          className={`tab ${mode === 'battle' ? 'active' : ''}`}
          onClick={() => setMode('battle')}
        >
          Battle Deck
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'war'}
          className={`tab ${mode === 'war' ? 'active' : ''}`}
          onClick={() => setMode('war')}
        >
          War Decks <span className="tab-badge">4</span>
        </button>
      </nav>

      <div className="layout">
        {/* LEFT: full card pool */}
        <section className="panel pool">
          <div className="pool-controls">
            <label className="field grow">
              <span>Search</span>
              <input
                type="text"
                placeholder="Card name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={showLocked}
                onChange={(e) => setShowLocked(e.target.checked)}
              />
              <span>Show locked</span>
            </label>
          </div>

          <p className="hint">
            Click a card: <span className="inc-text">✓ want</span> →{' '}
            <span className="exc-text">✕ don't want</span> → clear.
          </p>

          {cards.length === 0 ? (
            <p className="loading">Loading cards…</p>
          ) : (
            <div className="card-grid">
              {visibleCards.map((c) => (
                <CardTile
                  key={c.key}
                  card={c}
                  state={selections[c.key] ?? null}
                  locked={c.arena > arena}
                  onClick={() => cycleSelection(c.key)}
                />
              ))}
            </div>
          )}
        </section>

        {/* RIGHT: suggestions on top, then want / don't-want boxes */}
        <aside className="sidebar">
          <section className="panel suggest-panel">
            <div className="suggest-head">
              <div className="suggest-title">
                <h2>{mode === 'war' ? 'Suggested war decks' : 'Suggested battle decks'}</h2>
              </div>
              <div className="suggest-actions">
                <label className="field">
                  <span>Arena</span>
                  <select value={arena} onChange={(e) => setArena(Number(e.target.value))}>
                    {arenaOptions.map((a) => (
                      <option key={a} value={a}>
                        {arenaLabel(a)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="generate-btn"
                  onClick={generate}
                  disabled={generating || cards.length === 0}
                >
                  {generating ? 'Building…' : 'Generate'}
                </button>
              </div>
            </div>

            {mode === 'war' && (
              <p className="mode-note">
                War mode builds <strong>4 decks with no shared cards</strong> (32 unique cards) for War Day.
              </p>
            )}

            {notice && <p className="notice">{notice}</p>}
            {genError && <p className="gen-error">{genError}</p>}

            {decks && decks.length > 0 ? (
              <DeckResults decks={decks} cardsByKey={cardsByKey} />
            ) : (
              !generating && (
                <p className="suggest-placeholder">
                  Pick the cards you want and don't want, choose your arena, then hit{' '}
                  <strong>Generate</strong> to see your recommended decks.
                </p>
              )
            )}
          </section>

          <section className="panel tray include-tray">
            <div className="tray-head">
              <span className="tray-title inc">
                Cards I want ({includeKeys.length}/{maxInclude})
              </span>
              {hasSelection && (
                <button type="button" className="link-btn" onClick={clearSelections}>
                  Clear all
                </button>
              )}
            </div>
            <div className="tray-cards">
              {includeKeys.length === 0 && <span className="tray-empty">Click cards to add</span>}
              {includeKeys.map((k) => {
                const c = cardsByKey.get(k)
                return c ? (
                  <CardTile key={k} card={c} state="include" size="sm" onClick={() => cycleSelection(k)} />
                ) : null
              })}
            </div>
          </section>

          <section className="panel tray exclude-tray">
            <div className="tray-head">
              <span className="tray-title exc">Cards I don't want ({excludeKeys.length})</span>
            </div>
            <div className="tray-cards">
              {excludeKeys.length === 0 && (
                <span className="tray-empty">Click a card twice to ban it</span>
              )}
              {excludeKeys.map((k) => {
                const c = cardsByKey.get(k)
                return c ? (
                  <CardTile key={k} card={c} state="exclude" size="sm" onClick={() => cycleSelection(k)} />
                ) : null
              })}
            </div>
          </section>
        </aside>
      </div>

      <footer className="app-footer">
        Card data &amp; images from the community{' '}
        <a href="https://github.com/RoyaleAPI/cr-api-data" target="_blank" rel="noreferrer">
          cr-api-data
        </a>{' '}
        dataset. Not affiliated with Supercell.
      </footer>
    </div>
  )
}
