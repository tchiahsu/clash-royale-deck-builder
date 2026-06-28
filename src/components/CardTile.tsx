import { cardImageUrl, arenaLabel } from '../lib/cards'
import type { Card, SelectionState } from '../types'

interface Props {
  card: Card
  state?: SelectionState | null
  locked?: boolean
  size?: 'sm' | 'md'
  onClick?: () => void
}

export default function CardTile({ card, state = null, locked = false, size = 'md', onClick }: Props) {
  const className = ['card-tile', size, state ?? '', locked ? 'locked' : '']
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <img
        src={cardImageUrl(card.key)}
        alt={card.name}
        loading="lazy"
        draggable={false}
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden'
        }}
      />
      <span className="card-tip">{card.name}</span>
      {state === 'include' && <span className="badge inc">✓</span>}
      {state === 'exclude' && <span className="badge exc">✕</span>}
      {locked && (
        <span className="lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2">
            <rect x="5" y="11" width="14" height="9" rx="2" fill="#1f2d3f" stroke="none" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
      )}
    </>
  )

  if (!onClick) {
    return (
      <div className={className} title={card.name}>
        {inner}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={className}
      disabled={locked}
      onClick={onClick}
      title={locked ? `${card.name} — unlocks at ${arenaLabel(card.arena)}` : card.name}
    >
      {inner}
    </button>
  )
}
