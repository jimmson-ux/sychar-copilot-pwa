import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/requireAuth'

// TODO: Replace with full school context prompt when provided
const SYSTEM_PROMPT = `You are an intelligent school management AI assistant for a Kenyan secondary school. Be concise, practical, and grounded in the Kenyan education context (KCSE, CBC, KNEC guidelines).`

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
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ content })
  } catch (err) {
    console.error('[api/ai] error:', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
