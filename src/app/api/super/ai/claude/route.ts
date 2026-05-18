export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { prompt, model } = (await req.json().catch(() => ({}))) as { prompt?: string; model?: string }
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 })

  const useModel = model === 'opus' ? 'llama-3.3-70b-versatile' : 'llama-3.3-70b-versatile'

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization:   `Bearer ${groqKey}`,
      'content-type':  'application/json',
    },
    body: JSON.stringify({
      model:      useModel,
      max_tokens: 1024,
      messages: [
        {
          role:    'system',
          content: "You are Sychar Copilot's AI assistant helping a super admin manage a school SaaS platform. Be concise and precise.",
        },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    console.error('[super/ai/claude]', res.status, err)
    return NextResponse.json({ error: 'AI error' }, { status: 502 })
  }

  const data = await res.json() as { choices?: { message: { content: string } }[] }
  const reply = data.choices?.[0]?.message?.content ?? ''

  const db = adminClient()
  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'ai_claude_query', entity_type: 'system', entity_id: null,
    meta: { model: useModel, prompt_len: prompt.length },
  })

  return NextResponse.json({ reply, model: useModel })
}
