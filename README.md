# Clash Royale Deck Builder

A deck recommendation tool for Clash Royale players who want to build around
specific cards. Pick the cards you want, the cards you want to avoid, and your
arena — then an LLM suggests decks with estimated win rates, an elixir profile,
and a breakdown of how each deck plays. Decks are one-time use; nothing is saved.

- **Frontend:** Vite + React + TypeScript
- **Backend:** Express proxy that calls Google **Gemini** (`@google/genai`)
- **Card data:** the public [`cr-api-data`](https://github.com/RoyaleAPI/cr-api-data)
  static dataset + card images — no Supercell API key or IP whitelist needed.

> **Note on win rates:** the Clash Royale API does not expose deck win rates.
> The percentages shown are **Gemini's estimates**, not real ladder statistics.

## Features

- **Two modes (tabs):**
  - **Battle Deck** — suggests 3 ladder decks (cards may repeat between decks).
  - **War Decks** — suggests 4 decks for War Day with **no card shared** across
    them (32 distinct cards).
- **Want / don't-want selection** — click a card to cycle want → don't-want →
  clear; selections drive the recommendations.
- **Arena-gated pool** — only cards unlocked at your selected arena are used.
- **Sort** the pool by elixir, type, or rarity; filter with search and an
  optional "show locked" toggle.
- **Per-deck detail** — collapsible cards showing the 8 cards, average elixir,
  4-card cycle cost, win condition / tank / offense / defense breakdown, and a
  real **clashroyale.com deck link** (copy or open straight in the game).

## Setup

1. Get a **free** Gemini API key at <https://aistudio.google.com/apikey>.
2. Copy the example env file and paste your key:

   ```bash
   cp .env.example .env
   # then edit .env and set GEMINI_API_KEY=...
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

## Run (development)

Runs the Vite dev server (port 5173) and the Express API (port 8787) together.
Vite proxies `/api/*` to the backend, so the key never reaches the browser.

```bash
npm run dev
```

Open <http://localhost:5173>.

## Build & run (production)

```bash
npm run build   # typecheck + bundle the frontend into dist/
npm start       # serves dist/ AND the API from one Express server on PORT (8787)
```

## How it works

1. The browser loads the full card list from the static dataset and renders the
   pool, gated by your selected arena (cards unlock by arena).
2. Pick a deck mode (Battle or War), then click cards to mark them as wanted or
   not wanted.
3. **Generate** posts your mode, arena, includes, excludes, and unlocked card
   pool to `POST /api/recommend`.
4. The server prompts Gemini with a strict JSON schema (3 decks for Battle, 4
   non-overlapping decks for War). It validates every returned card key against
   your pool, recomputes average elixir, and returns each deck with its role
   breakdown.
5. The UI builds each deck's `clashroyale.com` link from the card IDs so you can
   open it directly in the game.

## Configuration

| Env var          | Default            | Purpose                          |
| ---------------- | ------------------ | -------------------------------- |
| `GEMINI_API_KEY` | _(required)_       | Google AI Studio key             |
| `GEMINI_MODEL`   | `gemini-2.5-flash` | Gemini model (free-tier capable) |
| `PORT`           | `8787`             | API server port                  |
