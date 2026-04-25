export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { prompt, model } = await req.json().catch(() => ({}))
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const useModel = model === 'opus' ? 'claude-opus-4-7' : 'claude-sonnet-4-6'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      useModel,
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
      system:     "You are Sychar Copilot's AI assistant helping a super admin manage a school SaaS platform. Be concise and precise.",
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    console.error('[super/ai/claude]', res.status, err)
    return NextResponse.json({ error: 'Claude API error' }, { status: 502 })
  }

  const data = await res.json()
  const reply = data.content?.[0]?.text ?? ''

  const db = adminClient()
  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'ai_claude_query', entity_type: 'system', entity_id: null,
    meta: { model: useModel, prompt_len: prompt.length },
  })

  return NextResponse.json({ reply, model: useModel, usage: data.usage })
}
