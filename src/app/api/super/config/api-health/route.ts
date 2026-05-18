export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super/requireSuperAdmin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const checks = await Promise.allSettled([
    pingGroq(),
    pingGemini(),
    pingAT(),
  ])

  const results = [
    { name: 'Groq (llama-3.3)',    ...settle(checks[0]) },
    { name: 'Gemini (Google)',      ...settle(checks[1]) },
    { name: 'Africa\'s Talking',   ...settle(checks[2]) },
  ]

  return NextResponse.json({ services: results, checkedAt: new Date().toISOString() })
}

function settle(r: PromiseSettledResult<{ ok: boolean; latencyMs: number }>) {
  if (r.status === 'fulfilled') return r.value
  return { ok: false, latencyMs: 0, error: String(r.reason) }
}

async function pingGroq() {
  if (!process.env.GROQ_API_KEY) return { ok: false, latencyMs: 0, error: 'Key missing' }
  const t = Date.now()
  const r = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  })
  return { ok: r.ok, latencyMs: Date.now() - t }
}

async function pingGemini() {
  if (!process.env.GEMINI_API_KEY) return { ok: false, latencyMs: 0, error: 'Key missing' }
  const t = Date.now()
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`)
  return { ok: r.ok, latencyMs: Date.now() - t }
}

async function pingAT() {
  if (!process.env.AT_API_KEY) return { ok: false, latencyMs: 0, error: 'Key missing' }
  const t = Date.now()
  const r = await fetch('https://api.africastalking.com/version1/user', {
    headers: { apiKey: process.env.AT_API_KEY, Accept: 'application/json' },
  })
  return { ok: r.ok, latencyMs: Date.now() - t }
}
