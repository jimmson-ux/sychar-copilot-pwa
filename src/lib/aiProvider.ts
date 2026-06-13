// Unified server-side AI provider for the Next platform: OpenAI (ChatGPT) primary,
// Anthropic (Claude) fallback, Groq last resort. Mirrors the shared `ai-ask` edge
// function used by the TanStack school PWAs, so every Ask-AI surface — staff,
// parent, platform — runs the same provider chain with the same secrets.
//
// Keep this server-only (reads API keys from env). Callers build the system prompt
// (school context + RAG) and pass messages.

export type AiMessage = { role: 'user' | 'assistant' | 'system'; content: string }
export interface AiResult { content: string; provider: 'openai' | 'anthropic' | 'groq' }

const OPENAI_MODEL    = process.env.OPENAI_MODEL    ?? 'gpt-4o'
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest'
const GROQ_MODEL      = process.env.GROQ_MODEL      ?? 'llama-3.3-70b-versatile'

// The platform's "OPENAI_API_KEY" is an OpenRouter key (sk-or-…) which reaches BOTH
// ChatGPT (openai/gpt-4o) and Claude (anthropic/claude-3.5-sonnet) on one key. Detect
// it and route accordingly; native OpenAI/Anthropic keys still work if configured.
type Provider = { label: 'openai' | 'anthropic' | 'groq'; kind: 'chat' | 'anthropic'; url: string; key: string; model: string }
const isOpenRouter = (k?: string) => !!k && k.startsWith('sk-or-')
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'

function providerChain(): Provider[] {
  const chain: Provider[] = []
  const orKey = process.env.OPENROUTER_API_KEY ?? (isOpenRouter(process.env.OPENAI_API_KEY) ? process.env.OPENAI_API_KEY! : '')
  const openaiKey = process.env.OPENAI_API_KEY
  const anthKey = process.env.ANTHROPIC_API_KEY
  const groqKey = process.env.GROQ_API_KEY

  if (orKey) chain.push({ label: 'openai', kind: 'chat', url: OR_URL, key: orKey, model: process.env.OPENROUTER_OPENAI_MODEL ?? 'openai/gpt-4o' })
  else if (openaiKey) chain.push({ label: 'openai', kind: 'chat', url: 'https://api.openai.com/v1/chat/completions', key: openaiKey, model: OPENAI_MODEL })

  if (orKey) chain.push({ label: 'anthropic', kind: 'chat', url: OR_URL, key: orKey, model: process.env.OPENROUTER_ANTHROPIC_MODEL ?? 'anthropic/claude-3.5-sonnet' })
  else if (anthKey && !isOpenRouter(anthKey)) chain.push({ label: 'anthropic', kind: 'anthropic', url: 'https://api.anthropic.com/v1/messages', key: anthKey, model: ANTHROPIC_MODEL })

  if (groqKey) chain.push({ label: 'groq', kind: 'chat', url: 'https://api.groq.com/openai/v1/chat/completions', key: groqKey, model: GROQ_MODEL })
  return chain
}

/**
 * Run the provider chain (ChatGPT → Claude → Groq). Throws only if EVERY configured
 * provider fails. maxTokens clamped to [64, 4000].
 */
export async function askAIProvider(
  systemPrompt: string,
  messages: AiMessage[],
  maxTokens = 1000,
): Promise<AiResult> {
  const tokens = Math.min(Math.max(maxTokens, 64), 4000)
  const errors: string[] = []
  for (const p of providerChain()) {
    try {
      const content = await callProvider(p, systemPrompt, messages, tokens)
      if (content) return { content, provider: p.label }
    } catch (e) {
      errors.push(`${p.label}: ${(e as Error).message}`)
    }
  }
  throw new Error(`All AI providers failed — ${errors.join(' | ')}`)
}

async function callProvider(p: Provider, system: string, messages: AiMessage[], maxTokens: number): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    if (p.kind === 'anthropic') {
      const r = await fetch(p.url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'x-api-key': p.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.model, max_tokens: maxTokens, system, messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) }),
      })
      if (!r.ok) throw new Error(`${r.status}`)
      const d = await r.json() as { content?: { text: string }[] }
      return d.content?.map((c) => c.text).join('') ?? ''
    }
    const r = await fetch(p.url, {
      method: 'POST', signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json',
        ...(p.url.includes('openrouter') ? { 'HTTP-Referer': 'https://sychar.co.ke', 'X-Title': 'Sychar' } : {}),
      },
      body: JSON.stringify({ model: p.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] }),
    })
    if (!r.ok) throw new Error(`${r.status}`)
    const d = await r.json() as { choices?: { message: { content: string } }[] }
    return d.choices?.[0]?.message?.content ?? ''
  } finally {
    clearTimeout(timer)
  }
}
