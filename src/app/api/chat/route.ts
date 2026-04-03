import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

const SYSTEM_PROMPT = `You are an intelligent assistant for Sychar School management system.
You help school staff (teachers, HODs, bursars, principals) with:
- Understanding student records, fee payments, and financial summaries
- Analysing discipline records and apology letters
- Reviewing HOD reports and department performance
- Explaining mark sheets and academic progress
- Navigating the document scanner features
- General school administration queries

Be concise, professional, and practical. When referencing data, be specific.
Do not make up student names or financial figures. If you don't know something, say so clearly.`

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.error('[chat] ANTHROPIC_API_KEY not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // 1. Verify session — derives userId and schoolId server-side
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const body = rawBody as { messages?: unknown }
  const messages = body.messages

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  // Validate each message shape
  const safeMessages: Message[] = []
  for (const m of messages) {
    if (
      typeof m !== 'object' || m === null ||
      !('role' in m) || !('content' in m) ||
      (m.role !== 'user' && m.role !== 'assistant') ||
      typeof m.content !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 })
    }
    safeMessages.push({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 8000) })
  }

  const contextNote = `\n\nCurrent user sub_role: ${auth.subRole ?? 'unknown'}`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT + contextNote,
        messages: safeMessages,
      }),
    })
  } catch {
    console.error('[chat] Anthropic fetch failed')
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 })
  }

  if (!res.ok) {
    console.error('[chat] Anthropic error:', res.status)
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 })
  }

  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? ''

  return NextResponse.json({ reply: text })
}
