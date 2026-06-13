import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { buildSchoolSystemPrompt } from '@/lib/aiSchoolContext'
import { retrieveSchoolContext, formatRagContext } from '@/lib/rag'
import { askAIProvider, type AiMessage } from '@/lib/aiProvider'

const BASE_PROMPT = `You are an intelligent school management AI assistant. Be concise, practical, and grounded in the Kenyan education context (KCSE, CBC, KNEC guidelines).`

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  let body: { messages: Array<{ role: string; content: string }>; maxTokens?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { messages, maxTokens = 1000 } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  try {
    let systemPrompt = await buildSchoolSystemPrompt(auth.schoolId, BASE_PROMPT)

    // RAG: ground the answer in this school's own records (strictly school-scoped).
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content
    if (lastUser) {
      const chunks = await retrieveSchoolContext(auth.schoolId, lastUser)
      const ragBlock = formatRagContext(chunks)
      if (ragBlock) systemPrompt = `${systemPrompt}\n\n${ragBlock}`
    }

    // OpenAI (ChatGPT) → Anthropic (Claude) → Groq.
    const { content, provider } = await askAIProvider(
      systemPrompt,
      messages.map((m) => ({ role: m.role as AiMessage['role'], content: m.content })),
      maxTokens,
    )
    return NextResponse.json({ content, provider })
  } catch (err) {
    console.error('[api/ai] error:', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 })
  }
}
