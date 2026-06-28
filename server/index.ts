import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GoogleGenAI, Type } from '@google/genai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT ?? 8787)
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const API_KEY = process.env.GEMINI_API_KEY

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

/** A card as sent by the frontend pool. */
interface PoolCard {
  key: string
  name: string
  elixir: number
  type: string
  rarity: string
}

interface RecommendBody {
  arena?: number
  mode?: 'ladder' | 'war'
  include?: string[]
  exclude?: string[]
  pool?: PoolCard[]
}

const deckSchema = {
  type: Type.OBJECT,
  properties: {
    decks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Short catchy deck name' },
          archetype: {
            type: Type.STRING,
            description: 'e.g. Beatdown, Control, Cycle, Bait, Siege, Bridge Spam',
          },
          cards: {
            type: Type.ARRAY,
            description: 'Exactly 8 unique card keys from the provided pool',
            items: { type: Type.STRING },
          },
          estimatedWinRate: {
            type: Type.NUMBER,
            description: 'Your expert estimate as a percentage (e.g. 57). Not real ladder data.',
          },
          averageElixir: { type: Type.NUMBER },
          description: { type: Type.STRING, description: 'Overview of what the deck is and why it works.' },
          winConditions: {
            type: Type.ARRAY,
            description: 'The card(s) you rely on to take towers.',
            items: { type: Type.STRING },
          },
          tank: {
            type: Type.STRING,
            description: "The deck's tank / mini-tank that soaks damage up front, or 'None' if it has no dedicated tank.",
          },
          offense: {
            type: Type.STRING,
            description: 'How you attack: what to push with, support cards, when to commit.',
          },
          defense: {
            type: Type.STRING,
            description: 'How you defend: key defensive cards and how to counter common threats.',
          },
        },
        required: [
          'name',
          'archetype',
          'cards',
          'estimatedWinRate',
          'description',
          'offense',
          'defense',
        ],
      },
    },
  },
  required: ['decks'],
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(API_KEY) })
})

app.post('/api/recommend', async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      error:
        'No GEMINI_API_KEY configured. Get a free key at https://aistudio.google.com/apikey, then put it in a .env file.',
    })
  }

  const body = req.body as RecommendBody
  const pool = Array.isArray(body.pool) ? body.pool : []
  const mode = body.mode === 'war' ? 'war' : 'ladder'
  const deckCount = mode === 'war' ? 4 : 3
  const maxInclude = deckCount * 8
  const include = (Array.isArray(body.include) ? body.include : []).slice(0, maxInclude)
  const exclude = Array.isArray(body.exclude) ? body.exclude : []
  const arena = Number.isFinite(body.arena) ? Number(body.arena) : 0

  // Ladder decks may share cards, so 8 is enough. War decks share none, so 4×8 = 32.
  const minPool = mode === 'war' ? 32 : 8
  if (pool.length < minPool) {
    return res.status(400).json({
      error:
        mode === 'war'
          ? `War mode builds 4 non-overlapping decks and needs at least ${minPool} unlocked cards (you have ${pool.length}). Raise your arena.`
          : `The available card pool must contain at least ${minPool} cards.`,
    })
  }

  const byKey = new Map(pool.map((c) => [c.key, c]))
  const byName = new Map(pool.map((c) => [c.name.toLowerCase(), c.key]))
  const normalizeKey = (raw: unknown): string | null => {
    const k = String(raw ?? '').trim()
    if (byKey.has(k)) return k
    const viaName = byName.get(k.toLowerCase())
    return viaName ?? null
  }

  const nameOf = (k: string) => byKey.get(k)?.name ?? k
  const includeList = include.length ? include.map(nameOf).join(', ') : 'none'
  const excludeList = exclude.length ? exclude.map(nameOf).join(', ') : 'none'

  const poolText = pool
    .map((c) => `- ${c.key}: ${c.name} (${c.elixir} elixir, ${c.type}, ${c.rarity})`)
    .join('\n')

  const numberWord = deckCount === 4 ? 'FOUR' : 'THREE'

  const includeRule =
    mode === 'war'
      ? `- Every must-include card must appear in at least one deck (a card belongs to only one deck in war).`
      : `- Every deck MUST contain all of the must-include cards.`

  const modeRules =
    mode === 'war'
      ? `This is for CLAN WAR. Build 4 decks for War Day where a card may be used in ONLY ONE deck.
- Across all 4 decks combined, EVERY card must be unique — no card may appear in more than one deck (32 distinct cards total).
- Each of the 4 decks should still be independently viable with its own win condition.`
      : `This is for LADder play. Make the ${deckCount} decks meaningfully different from one another (prefer different archetypes).`

  const prompt = `You are a Clash Royale deck-building expert. Build ${numberWord} distinct, competitive 8-card decks for a player.

${modeRules}

Player arena: ${arena === 0 ? 'Training Camp' : `Arena ${arena}`}
Cards the player wants used: ${includeList}
Cards the player does NOT want (never use these): ${excludeList}

You may ONLY use cards from this available pool (the player has unlocked these). Reference cards by their exact "key":
${poolText}

Rules:
- Build EXACTLY ${deckCount} decks. Each deck has EXACTLY 8 unique cards, each referenced by its exact key from the pool above.
${includeRule}
- No deck may contain any of the do-not-want cards.
- Each deck needs at least one real win condition and a sensible elixir curve.
- "estimatedWinRate" is YOUR expert estimate (balanced decks are usually 50-62); it is NOT real ladder data.
- "averageElixir" is the mean elixir cost of the 8 cards.
- For each deck explain how it works for a player at this arena: "description" (overview), "winConditions" (the cards used to take towers), "tank" (the tank/mini-tank that soaks damage, or "None"), "offense" (how to attack and support the push), and "defense" (key defensive cards and how to handle common threats).`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: deckSchema,
        temperature: 0.9,
      },
    })

    const text = response.text
    if (!text) {
      return res.status(502).json({ error: 'The model returned an empty response. Try again.' })
    }

    const parsed = JSON.parse(text) as { decks?: unknown[] }
    const rawDecks = Array.isArray(parsed.decks) ? parsed.decks : []

    const decks = rawDecks.map((d) => {
      const deck = d as Record<string, unknown>
      const rawCards = Array.isArray(deck.cards) ? deck.cards : []
      // Normalize to valid pool keys, drop unknowns and duplicates.
      const seen = new Set<string>()
      const cards: string[] = []
      for (const c of rawCards) {
        const k = normalizeKey(c)
        if (k && !seen.has(k)) {
          seen.add(k)
          cards.push(k)
        }
      }
      // Recompute average elixir from the real cards (more reliable than the model).
      const avg = cards.length
        ? cards.reduce((sum, k) => sum + (byKey.get(k)?.elixir ?? 0), 0) / cards.length
        : 0
      return {
        name: String(deck.name ?? 'Untitled Deck'),
        archetype: String(deck.archetype ?? ''),
        cards,
        estimatedWinRate: Number(deck.estimatedWinRate ?? 0),
        averageElixir: Math.round(avg * 10) / 10,
        description: String(deck.description ?? ''),
        winConditions: Array.isArray(deck.winConditions) ? deck.winConditions.map(String) : [],
        tank: deck.tank ? String(deck.tank) : '',
        offense: String(deck.offense ?? ''),
        defense: String(deck.defense ?? ''),
      }
    })

    res.json({ decks })
  } catch (err) {
    console.error('[recommend] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error generating decks.'
    res.status(500).json({ error: message })
  }
})

// In production, serve the built frontend from the same server.
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}  (model: ${MODEL}, key: ${API_KEY ? 'set' : 'MISSING'})`)
})
