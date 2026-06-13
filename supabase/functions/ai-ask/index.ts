import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyRequest, verifyToken } from '../_shared/auth.ts'

/**
 * ai-ask — the ONE Ask-AI provider for every school (staff + parent PWAs + the
 * Next platform). OpenAI (ChatGPT) is primary, Anthropic (Claude) is the fallback,
 * Groq is the last resort. Always school-scoped: the school_id comes from the
 * verified token (never the client body), the system prompt is framed for the
 * tenant (gender/boarding), and RAG is grounded ONLY in that school's documents.
 *
 * Body: { messages: [{role,content}], task?: string, maxTokens?: number }
 * Returns: { content, provider }
 *
 * Secrets: OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY (any subset; chain skips missing).
 *          OPENAI_MODEL / ANTHROPIC_MODEL / GROQ_MODEL optional overrides.
 */
const BASE_PROMPT =
  'You are an intelligent school-management AI assistant for a Kenyan school. Be concise, ' +
  'practical and grounded in the Kenyan education context (KCSE, CBC, KNEC/TSC). Be specific; avoid generic advice.'

const OPENAI_MODEL    = Deno.env.get('OPENAI_MODEL')    ?? 'gpt-4o'
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-3-5-sonnet-latest'
const GROQ_MODEL      = Deno.env.get('GROQ_MODEL')      ?? 'llama-3.3-70b-versatile'

type Msg = { role: 'user' | 'assistant' | 'system'; content: string }

serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } })

  try {
    // Accept staff (staff_records) OR parent (users) tokens.
    const auth = (await verifyRequest(req)) ?? (await verifyToken(req))
    if (!auth) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({})) as { messages?: Msg[]; task?: string; maxTokens?: number }
    const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m?.content?.trim()) : []
    if (messages.length === 0) return json({ error: 'messages array required' }, 400)
    const maxTokens = Math.min(Math.max(body.maxTokens ?? 1000, 64), 4000)

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── School-aware system prompt (tenant_configs is the live config store) ──
    let systemPrompt = BASE_PROMPT
    const { data: tc } = await supabase
      .from('tenant_configs')
      .select('name, gender_profile')
      .eq('school_id', auth.schoolId)
      .maybeSingle()
    if (tc?.name) systemPrompt += `\n\nSchool: ${tc.name}.`
    if (tc?.gender_profile === 'boys') systemPrompt += ' This is a BOYS-ONLY school — frame analysis around boy-child behaviour; never reference female students.'
    if (tc?.gender_profile === 'girls') systemPrompt += ' This is a GIRLS-ONLY school — frame analysis around girl-child behaviour; never reference male students.'
    if (body.task) systemPrompt += `\n\nTask focus: ${body.task}.`

    // ── RAG: ground in this school's documents only (best-effort) ──
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content
    const ragBlock = lastUser ? await ragContext(supabase, auth.schoolId, lastUser) : ''
    if (ragBlock) systemPrompt += `\n\nUse these school records when relevant:\n${ragBlock}`

    // ── Provider chain: ChatGPT → Claude → Groq (ChatGPT+Claude via OpenRouter if
    //    the key is an OpenRouter key, else native OpenAI/Anthropic) ──
    const errors: string[] = []
    for (const provider of providerChain()) {
      try {
        const content = await callProvider(provider, systemPrompt, messages, maxTokens)
        if (content) return json({ content, provider: provider.label, ...(errors.length ? { fellBackFrom: errors } : {}) })
      } catch (e) {
        errors.push(`${provider.label}: ${(e as Error).message}`)
      }
    }
    console.error('[ai-ask] all providers failed:', errors.join(' | '))
    return json({ error: 'AI temporarily unavailable', tried: errors }, 502)
  } catch (err) {
    console.error('[ai-ask] error:', err)
    return json({ error: 'AI request failed' }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function ragContext(supabase: any, schoolId: string, query: string): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return ''
  try {
    const emb = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: query.slice(0, 2000) }),
    })
    if (!emb.ok) return ''
    const ev = await emb.json() as { data?: { embedding: number[] }[] }
    const vector = ev.data?.[0]?.embedding
    if (!vector) return ''
    const { data } = await supabase.rpc('match_school_documents', {
      query_embedding: vector, p_school_id: schoolId, match_count: 5, match_threshold: 0.3,
    })
    // deno-lint-ignore no-explicit-any
    const rows = (data ?? []) as any[]
    return rows.map((r) => `- (${r.source_type ?? 'doc'}) ${r.chunk_text ?? ''}`.trim()).filter((s) => s.length > 6).join('\n').slice(0, 4000)
  } catch {
    return ''
  }
}

// An OpenAI-compatible chat endpoint (OpenRouter / OpenAI / Groq) or native Anthropic.
type Provider = { label: 'openai' | 'anthropic' | 'groq'; kind: 'chat' | 'anthropic'; url: string; key: string; model: string }

function isOpenRouter(k?: string | null): boolean { return !!k && k.startsWith('sk-or-') }

/** Build the ChatGPT → Claude → Groq chain from whatever keys are configured. */
function providerChain(): Provider[] {
  const chain: Provider[] = []
  const orKey = Deno.env.get('OPENROUTER_API_KEY') ?? (isOpenRouter(Deno.env.get('OPENAI_API_KEY')) ? Deno.env.get('OPENAI_API_KEY')! : '')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const anthKey = Deno.env.get('ANTHROPIC_API_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')
  const OR = 'https://openrouter.ai/api/v1/chat/completions'

  // ChatGPT (OpenAI) — via OpenRouter if the key is an OpenRouter key, else native.
  if (orKey) chain.push({ label: 'openai', kind: 'chat', url: OR, key: orKey, model: Deno.env.get('OPENROUTER_OPENAI_MODEL') ?? 'openai/gpt-4o' })
  else if (openaiKey) chain.push({ label: 'openai', kind: 'chat', url: 'https://api.openai.com/v1/chat/completions', key: openaiKey, model: OPENAI_MODEL })

  // Claude (Anthropic) — via OpenRouter (same key) if available, else native.
  if (orKey) chain.push({ label: 'anthropic', kind: 'chat', url: OR, key: orKey, model: Deno.env.get('OPENROUTER_ANTHROPIC_MODEL') ?? 'anthropic/claude-3.5-sonnet' })
  else if (anthKey && !isOpenRouter(anthKey)) chain.push({ label: 'anthropic', kind: 'anthropic', url: 'https://api.anthropic.com/v1/messages', key: anthKey, model: ANTHROPIC_MODEL })

  if (groqKey) chain.push({ label: 'groq', kind: 'chat', url: 'https://api.groq.com/openai/v1/chat/completions', key: groqKey, model: GROQ_MODEL })
  return chain
}

async function callProvider(p: Provider, system: string, messages: Msg[], maxTokens: number): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    if (p.kind === 'anthropic') {
      const r = await fetch(p.url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'x-api-key': p.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.model, max_tokens: maxTokens, system, messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) }),
      })
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 140)}`)
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
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 140)}`)
    const d = await r.json() as { choices?: { message: { content: string } }[] }
    return d.choices?.[0]?.message?.content ?? ''
  } finally {
    clearTimeout(timer)
  }
}
