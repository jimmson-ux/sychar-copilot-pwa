export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const checks = await Promise.all([
    checkKey('groq',    !!process.env.GROQ_API_KEY),
    checkKey('gemini',  !!process.env.GEMINI_API_KEY),
    checkKey('at_sms',  !!(process.env.AT_API_KEY && process.env.AT_USERNAME)),
  ])

  return NextResponse.json({ engines: checks })
}

function checkKey(name: string, present: boolean) {
  return { name, configured: present, status: present ? 'ready' : 'missing_key' }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { prompt, provider } = (await req.json().catch(() => ({}))) as { prompt?: string; provider?: string }
  if (!prompt || !provider) return NextResponse.json({ error: 'prompt and provider required' }, { status: 400 })

  const db = adminClient()

  if (provider === 'groq' || provider === 'claude') {
    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 })

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return NextResponse.json({ error: 'Provider error' }, { status: 502 })
    const d = await res.json() as { choices?: { message: { content: string } }[] }
    const reply = d.choices?.[0]?.message?.content ?? ''
    void db.from('god_mode_audit').insert({ actor_id: auth.ctx.userId, actor_email: auth.ctx.email, action: 'ai_test_groq', entity_type: 'system', entity_id: null, meta: { prompt_len: prompt.length } })
    return NextResponse.json({ reply, provider: 'groq', model: 'llama-3.1-8b-instant' })
  }

  if (provider === 'gemini') {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
    if (!res.ok) return NextResponse.json({ error: 'Provider error' }, { status: 502 })
    const d = await res.json() as { candidates?: { content: { parts: { text: string }[] } }[] }
    const reply = d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return NextResponse.json({ reply, provider: 'gemini', model: 'gemini-2.0-flash' })
  }

  return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
}
