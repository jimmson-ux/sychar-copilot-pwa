export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { prompt } = await req.json().catch(() => ({}))
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const model = 'gemini-2.0-flash'
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    console.error('[super/ai/gemini]', res.status, err)
    return NextResponse.json({ error: 'Gemini API error' }, { status: 502 })
  }

  const data  = await res.json()
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  const db = adminClient()
  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'ai_gemini_query', entity_type: 'system', entity_id: null,
    meta: { model, prompt_len: prompt.length },
  })

  return NextResponse.json({ reply, model })
}
