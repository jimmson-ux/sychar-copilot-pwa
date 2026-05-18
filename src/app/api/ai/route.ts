import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

const SYSTEM_PROMPT = `You are an intelligent school management AI assistant for a Kenyan secondary school. Be concise, practical, and grounded in the Kenyan education context (KCSE, CBC, KNEC guidelines).`

export async function POST(req: NextRequest) {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })

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
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
      }),
    })

    if (!groqRes.ok) return NextResponse.json({ error: 'AI request failed' }, { status: 502 })
    const groqData = await groqRes.json() as { choices?: { message: { content: string } }[] }
    const content = groqData.choices?.[0]?.message?.content ?? ''
    return NextResponse.json({ content })
  } catch (err) {
    console.error('[api/ai] error:', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
