import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GoogleGenAI, Type } from '@google/genai'
import { finalizeDecks, type PoolCard } from './finalize.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT ?? 8787)
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const API_KEY = process.env.GEMINI_API_KEY

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

interface RecommendBody {
  arena?: number
  mode?: 'battle' | 'war'
  include?: string[]
  exclude?: string[]
  pool?: PoolCard[]
}

// Schema for a SINGLE deck — we generate decks in parallel (one call each) so a
// request finishes in roughly one deck's latency instead of summing them.
const oneDeckSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'Short, catchy deck name' },
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
    description: { type: Type.STRING, description: 'Overview of what the deck is and why it works.' },
    winConditions: {
      type: Type.ARRAY,
      description: 'The card(s) you rely on to take towers.',
      items: { type: Type.STRING },
    },
    tank: {
      type: Type.STRING,
      description: "The deck's tank / mini-tank, or 'None' if it has no dedicated tank.",
    },
    offense: { type: Type.STRING, description: 'How you attack: what to push with and when.' },
    defense: { type: Type.STRING, description: 'How you defend: key cards and how to counter threats.' },
  },
  required: ['name', 'archetype', 'cards', 'estimatedWinRate', 'description', 'offense', 'defense'],
}

const BATTLE_VARIANTS = [
  'Build the strongest, most reliable all-around ladder deck from the pool.',
  'Build a deck with a clearly different archetype and win condition from a standard first pick (lean toward control or beatdown).',
  'Build a fast, low-average-elixir cycle or bait deck if the pool supports it; otherwise another distinct archetype.',
]

const WAR_VARIANTS = [
  'Aim for a Beatdown archetype: a heavy tank with support behind it.',
  'Aim for a Control or Siege archetype: defend and chip with a building or ranged win condition.',
  'Aim for a Fast Cycle archetype: a cheap, fast win condition with a low average elixir.',
  'Aim for a Bridge Spam or Bait archetype: apply dual-lane pressure or bait out counters.',
]

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
  const mode = body.mode === 'war' ? 'war' : 'battle'
  const deckCount = mode === 'war' ? 4 : 3
  const include = (Array.isArray(body.include) ? body.include : []).slice(0, deckCount * 8)
  const exclude = Array.isArray(body.exclude) ? body.exclude : []
  const arena = Number.isFinite(body.arena) ? Number(body.arena) : 0
  const arenaLabel = arena === 0 ? 'Training Camp' : `Arena ${arena}`

  // Battle decks may share cards (8 is enough). War's 4 decks share none, so we
  // need 32 unlocked cards that haven't been excluded.
  const excludeSet = new Set(exclude)
  const usableCount = pool.reduce((n, c) => n + (excludeSet.has(c.key) ? 0 : 1), 0)
  const minPool = mode === 'war' ? 32 : 8
  if (usableCount < minPool) {
    return res.status(400).json({
      error:
        mode === 'war'
          ? `War mode builds 4 decks with no shared cards, so it needs at least 32 unlocked, non-excluded cards (you have ${usableCount}). Raise your arena or exclude fewer cards.`
          : `The available card pool must contain at least ${minPool} cards.`,
    })
  }

  const byKey = new Map(pool.map((c) => [c.key, c]))
  const byName = new Map(pool.map((c) => [c.name.toLowerCase(), c.key]))
  const normalizeKey = (raw: unknown): string | null => {
    const k = String(raw ?? '').trim()
    if (byKey.has(k)) return k
    return byName.get(k.toLowerCase()) ?? null
  }
  const nameOf = (k: string) => byKey.get(k)?.name ?? k

  const excludeList = exclude.length ? exclude.map(nameOf).join(', ') : 'none'
  const poolText = pool
    .map((c) => `- ${c.key}: ${c.name} (${c.elixir} elixir, ${c.type}, ${c.rarity})`)
    .join('\n')

  const variants = mode === 'war' ? WAR_VARIANTS : BATTLE_VARIANTS
  // War: a must-include card can live in only one deck, so spread includes
  // across the four decks. Battle: every deck includes them.
  const includesFor = (i: number) =>
    mode === 'war' ? include.filter((_, idx) => idx % deckCount === i) : include

  const warNote =
    mode === 'war'
      ? ' This is one of 4 war decks that must NOT share any cards, so favor distinct win conditions and support cards.'
      : ''

  const buildPrompt = (variant: string, mustInclude: string[]) =>
    `You are a Clash Royale deck-building expert. Build ONE competitive 8-card deck for a player at ${arenaLabel}.

${variant}${warNote}

Cards this deck MUST include: ${mustInclude.length ? mustInclude.map(nameOf).join(', ') : 'none'}
Cards to NEVER use: ${excludeList}

Use ONLY cards from this pool, referenced by their exact "key":
${poolText}

Rules:
- EXACTLY 8 unique cards, each an exact key from the pool above.
- Include every must-include card; never use a do-not-want card.
- Sensible elixir curve and at least one real win condition.
- "estimatedWinRate" is your expert estimate (balanced decks ~50-62); it is NOT real ladder data.
- Explain the deck for this arena: "description" (overview), "winConditions" (cards used to take towers), "tank" (tank/mini-tank or "None"), "offense" (how to attack), "defense" (how to defend).
Return a single deck object.`

  // Call the model for one deck, retrying transient 429/503 ("high demand").
  const generateDeck = async (prompt: string): Promise<string | undefined> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: { responseMimeType: 'application/json', responseSchema: oneDeckSchema, temperature: 0.9 },
        })
        return r.text
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const transient = /(?:\b429\b|\b503\b|UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED)/i.test(
          msg,
        )
        if (!transient || attempt >= 3) throw err
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      }
    }
  }

  try {
    // Generate all decks in parallel. allSettled so one failed call (e.g. a
    // transient rate-limit) doesn't sink the whole request — that deck falls
    // back to a pool-built deck below. If every call fails, surface the error.
    const settled = await Promise.allSettled(
      variants.map((v, i) => generateDeck(buildPrompt(v, includesFor(i)))),
    )
    if (!settled.some((r) => r.status === 'fulfilled' && r.value)) {
      const firstError = settled.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined
      throw firstError?.reason instanceof Error
        ? firstError.reason
        : new Error('Deck generation failed.')
    }
    const texts = settled.map((r) => (r.status === 'fulfilled' ? r.value : undefined))

    // Second pass: any slot that failed (or returned nothing) gets one more
    // attempt, run sequentially so we don't burst into a rate limit. This is
    // what keeps a deck from falling back to a 0% pool-built deck in the
    // common case where a single parallel call hit a transient error.
    for (let i = 0; i < texts.length; i++) {
      if (texts[i]) continue
      try {
        texts[i] = await generateDeck(buildPrompt(variants[i], includesFor(i)))
      } catch {
        // Still failed — it'll get a heuristic estimate + pool backfill below.
      }
    }

    const parsed = texts.map((text) => {
      let obj: Record<string, unknown> = {}
      try {
        obj = text ? (JSON.parse(text) as Record<string, unknown>) : {}
      } catch {
        obj = {}
      }
      const rawCards = Array.isArray(obj.cards) ? obj.cards : []
      const cards = rawCards.map(normalizeKey).filter((k): k is string => Boolean(k))
      return {
        name: String(obj.name ?? 'Deck'),
        archetype: String(obj.archetype ?? ''),
        cards,
        estimatedWinRate: Number(obj.estimatedWinRate ?? 0),
        description: String(obj.description ?? ''),
        winConditions: Array.isArray(obj.winConditions) ? obj.winConditions.map(String) : [],
        tank: obj.tank ? String(obj.tank) : '',
        offense: String(obj.offense ?? ''),
        defense: String(obj.defense ?? ''),
      }
    })

    // Turn the model's parsed decks into final 8-card decks: honor must-include
    // cards, enforce War's no-shared-cards rule, de-duplicate, and assign a
    // sensible (non-zero) win rate. See server/finalize.ts.
    const decks = finalizeDecks(parsed, { pool, mode, include, exclude })

    res.json({ decks })
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    console.error('[recommend] error:', raw)
    const rateLimited = /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(raw)
    if (rateLimited) {
      return res.status(429).json({
        error:
          'Gemini free-tier rate limit reached (5 requests/minute). Wait about a minute and try again, or switch GEMINI_API_KEY to a paid key for higher limits.',
      })
    }
    res.status(500).json({ error: 'Could not generate decks. Please try again.' })
  }
})

// Serve the built frontend from the same server whenever a build exists.
// Keyed off the dist/ folder rather than NODE_ENV so it works on any host
// regardless of how (or whether) NODE_ENV is set. In local dev the build is
// served by Vite on its own port, so this branch simply doesn't get hit.
const dist = path.resolve(__dirname, '../dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  // SPA fallback: any non-API route returns index.html so deep links and
  // page reloads resolve client-side instead of 404-ing.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}  (model: ${MODEL}, key: ${API_KEY ? 'set' : 'MISSING'})`)
})
