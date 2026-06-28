import { useState } from 'react'
import type { Card, Deck } from '../types'
import CardTile from './CardTile'

interface Props {
  decks: Deck[]
  cardsByKey: Map<string, Card>
}

export default function DeckResults({ decks, cardsByKey }: Props) {
  return (
    <section className="results">
      <p className="disclaimer">
        Win rates are AI estimates from Gemini — not real ladder statistics.
      </p>
      {decks.map((deck, i) => (
        <DeckCard key={`${deck.name}-${i}`} deck={deck} cardsByKey={cardsByKey} />
      ))}
    </section>
  )
}

function Drop({ value, variant }: { value: number | string; variant: 'elixir' | 'cycle' }) {
  const fill = variant === 'cycle' ? '#e94f9a' : '#b14de0'
  return (
    <span className="stat" title={variant === 'cycle' ? '4-card cycle cost' : 'Average elixir'}>
      <svg className="drop" viewBox="0 0 16 20" aria-hidden="true">
        <path d="M8 1.5C8 1.5 2.5 8.5 2.5 12.8a5.5 5.5 0 0 0 11 0C13.5 8.5 8 1.5 8 1.5Z" fill={fill} />
      </svg>
      {value}
    </span>
  )
}

function DeckCard({ deck, cardsByKey }: { deck: Deck; cardsByKey: Map<string, Card> }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const cards = deck.cards.map((k) => cardsByKey.get(k)).filter((c): c is Card => Boolean(c))

  const deckLink = `https://link.clashroyale.com/deck/en?deck=${cards.map((c) => c.id).join(';')}`
  const avg =
    deck.averageElixir ??
    (cards.length ? cards.reduce((s, c) => s + c.elixir, 0) / cards.length : 0)
  const cycle = [...cards]
    .sort((a, b) => a.elixir - b.elixir)
    .slice(0, 4)
    .reduce((s, c) => s + c.elixir, 0)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(deckLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <article className={`deck-card ${open ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="deck-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="deck-title">
          <span className="deck-name">{deck.name}</span>
          {deck.archetype && <span className="archetype">{deck.archetype}</span>}
        </span>
        <span className="deck-head-stats">
          <Drop value={avg.toFixed(1)} variant="elixir" />
          <span className="winrate">~{Math.round(deck.estimatedWinRate)}%</span>
        </span>
      </button>

      <div className="deck-cards">
        {cards.map((c) => (
          <CardTile key={c.key} card={c} size="sm" />
        ))}
      </div>

      {open && (
        <div className="deck-body">
          <div className="deck-stats-row">
            <Drop value={cycle} variant="cycle" />
            <div className="deck-actions">
              <button type="button" className="icon-btn" onClick={copyLink} title="Copy Clash Royale deck link">
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <a
                className="icon-btn primary"
                href={deckLink}
                target="_blank"
                rel="noreferrer"
                title="Open in Clash Royale"
              >
                Open in game
              </a>
            </div>
          </div>

          {deck.description && <p className="deck-desc">{deck.description}</p>}

          <dl className="deck-roles">
            {deck.winConditions && deck.winConditions.length > 0 && (
              <Role label="Win condition" tone="win" text={deck.winConditions.join(', ')} />
            )}
            {deck.tank && deck.tank.toLowerCase() !== 'none' && (
              <Role label="Tank" tone="tank" text={deck.tank} />
            )}
            {deck.offense && <Role label="Offense" tone="offense" text={deck.offense} />}
            {deck.defense && <Role label="Defense" tone="defense" text={deck.defense} />}
          </dl>
        </div>
      )}
    </article>
  )
}

function Role({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="role">
      <dt className={`role-label ${tone}`}>{label}</dt>
      <dd>{text}</dd>
    </div>
  )
}
